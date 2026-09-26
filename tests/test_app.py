import importlib.util
import json
import tempfile
import threading
import unittest
from http.client import HTTPConnection
from http.server import ThreadingHTTPServer
from pathlib import Path
from unittest.mock import patch


ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location("joy_map_app", ROOT / "app.py")
app = importlib.util.module_from_spec(SPEC)
assert SPEC.loader
SPEC.loader.exec_module(app)


class JoyMapDatabaseTests(unittest.TestCase):
    def setUp(self):
        self.tempdir = tempfile.TemporaryDirectory()
        app.DATA_DIR = Path(self.tempdir.name)
        app.DB_PATH = app.DATA_DIR / "test.db"
        app.SECRET_KEY = "t" * 48
        app.APP_USERNAME = "tester"
        app.init_database()

    def tearDown(self):
        self.tempdir.cleanup()

    def test_seed_categories_and_crud_place(self):
        categories = app.list_categories()
        self.assertEqual([item["slug"] for item in categories], ["restaurant", "attraction"])

        created = app.create_place({
            "provider": "google",
            "provider_place_id": "ChIJ-test",
            "label": "테스트 장소",
            "category_id": categories[0]["id"],
            "country_code": "KR",
            "region": "서울특별시",
            "locality": "서울",
            "district": "종로구",
            "planned_month": 5,
            "memo": "다시 가기",
            "latitude": 37.57,
            "longitude": 126.98,
        })
        self.assertEqual(created["label"], "테스트 장소")
        self.assertEqual(created["planned_month"], 5)
        self.assertFalse(created["location_cache_stale"])

        filtered = app.list_places({"country_code": ["KR"], "district": ["종로구"]})
        self.assertEqual(len(filtered), 1)
        self.assertEqual(len(app.list_places({"scope": ["domestic"]})), 1)
        self.assertEqual(len(app.list_places({"planned_month": ["5"]})), 1)
        self.assertEqual(len(app.list_places({"area_q": ["종로"]})), 1)
        self.assertEqual(app.list_places({"scope": ["international"]}), [])

        updated = app.update_place(created["id"], {"memo": "수정한 메모", "planned_month": 11})
        self.assertEqual(updated["memo"], "수정한 메모")
        self.assertEqual(updated["planned_month"], 11)

        app.delete_place(created["id"])
        self.assertEqual(app.list_places({}), [])

    def test_duplicate_provider_place_id_is_rejected(self):
        category_id = app.list_categories()[0]["id"]
        payload = {
            "provider": "manual",
            "provider_place_id": "manual:abc",
            "label": "좌표",
            "category_id": category_id,
            "latitude": 1,
            "longitude": 2,
        }
        app.create_place(payload)
        with self.assertRaises(app.ApiError) as caught:
            app.create_place(payload)
        self.assertEqual(caught.exception.status, 409)

    def test_planned_month_validation(self):
        category_id = app.list_categories()[0]["id"]
        with self.assertRaises(app.ApiError) as caught:
            app.create_place({
                "provider": "manual",
                "provider_place_id": "manual:bad-month",
                "label": "잘못된 월",
                "category_id": category_id,
                "planned_month": 13,
            })
        self.assertEqual(caught.exception.status, 400)

    def test_category_create_update_and_delete(self):
        created = app.create_category({"name": "카페", "color": "#123456"})
        updated = app.update_category(created["id"], {"name": "디저트", "color": "#ABCDEF"})
        self.assertEqual(updated["name"], "디저트")
        self.assertEqual(updated["color"], "#ABCDEF")
        app.delete_category(created["id"])
        self.assertNotIn(created["id"], [category["id"] for category in app.list_categories()])

    def test_category_in_use_cannot_be_deleted(self):
        category = app.list_categories()[0]
        app.create_place({
            "provider": "manual",
            "provider_place_id": "manual:category-use",
            "label": "카테고리 사용 장소",
            "category_id": category["id"],
            "latitude": 37.5,
            "longitude": 127.0,
        })
        with self.assertRaises(app.ApiError) as caught:
            app.delete_category(category["id"])
        self.assertEqual(caught.exception.status, 409)

    def test_optimized_route_keeps_start_and_destination(self):
        costs = [
            [0, 1, 8, 9],
            [9, 0, 1, 5],
            [9, 4, 0, 1],
            [1, 9, 9, 0],
        ]
        order = app.optimal_open_route_order(costs)
        self.assertEqual(order[0], 0)
        self.assertEqual(order[-1], 3)
        self.assertEqual(set(order), {0, 1, 2, 3})

    def test_signed_session_expiry_and_tampering(self):
        token = app.make_session_token("tester")
        self.assertEqual(app.verify_session_token(token), "tester")
        self.assertIsNone(app.verify_session_token(token + "x"))

    def test_eight_character_password_is_allowed(self):
        with (
            patch.object(app, "APP_PASSWORD", "map-1234"),
            patch.object(app, "SECRET_KEY", "s" * 32),
            patch.object(app, "GOOGLE_MAPS_API_KEY", "maps-key"),
            patch.object(app, "KAKAO_REST_API_KEY", "kakao-key"),
        ):
            app.validate_environment()

        with (
            patch.object(app, "APP_PASSWORD", "short7"),
            patch.object(app, "SECRET_KEY", "s" * 32),
        ):
            with self.assertRaises(SystemExit):
                app.validate_environment()

    def test_password_only_login(self):
        with (
            patch.object(app, "APP_USERNAME", "admin"),
            patch.object(app, "APP_PASSWORD", "map-1234"),
            patch.object(app, "COOKIE_SECURE", True),
        ):
            server = ThreadingHTTPServer(("127.0.0.1", 0), app.JoyMapHandler)
            thread = threading.Thread(target=server.serve_forever, daemon=True)
            thread.start()
            try:
                connection = HTTPConnection("127.0.0.1", server.server_port)
                body = json.dumps({"password": "map-1234"})
                connection.request(
                    "POST",
                    "/api/login",
                    body=body,
                    headers={
                        "Content-Type": "application/json",
                        "X-Requested-With": "JoyMap",
                    },
                )
                response = connection.getresponse()
                payload = json.loads(response.read())
                self.assertEqual(response.status, 200)
                self.assertEqual(payload["username"], "admin")
                self.assertIn("joy_session=", response.getheader("Set-Cookie"))
                self.assertIn("Secure", response.getheader("Set-Cookie"))
                connection.close()
            finally:
                server.shutdown()
                server.server_close()
                thread.join(timeout=2)

    def test_domestic_driving_route_converts_kakao_vertices(self):
        kakao_response = {
            "routes": [{
                "result_code": 0,
                "summary": {"distance": 1250, "duration": 240},
                "sections": [{
                    "distance": 1250,
                    "duration": 240,
                    "roads": [{"vertexes": [127.1, 37.4, 127.2, 37.5]}],
                    "guides": [{
                        "guidance": "테스트로 방면으로 우회전",
                        "name": "테스트로",
                        "distance": 320,
                        "duration": 45,
                        "type": 3,
                    }],
                }],
            }],
        }
        points = [
            {"latitude": 37.4, "longitude": 127.1, "label": "출발"},
            {"latitude": 37.5, "longitude": 127.2, "label": "도착"},
        ]
        with patch.object(app, "request_kakao_api", return_value=kakao_response):
            route = app.plan_domestic_driving_route(points)
        self.assertEqual(route["provider"], "kakao")
        self.assertEqual(route["order"], [0, 1])
        self.assertEqual(route["path"], [[37.4, 127.1], [37.5, 127.2]])
        self.assertEqual(route["distanceMeters"], 1250)
        self.assertEqual(route["durationMillis"], 240000)
        self.assertEqual(route["guidance"][0]["from"], "출발")
        self.assertEqual(route["guidance"][0]["to"], "도착")
        self.assertEqual(route["guidance"][0]["steps"][0]["instruction"], "테스트로 방면으로 우회전")
        self.assertEqual(route["guidance"][0]["steps"][0]["durationMillis"], 45000)

    def test_domestic_route_rejects_invalid_coordinates(self):
        with self.assertRaises(app.ApiError) as caught:
            app.validate_route_points([
                {"latitude": 37.4, "longitude": 127.1},
                {"latitude": "not-a-number", "longitude": 127.2},
            ])
        self.assertEqual(caught.exception.status, 400)


if __name__ == "__main__":
    unittest.main()
