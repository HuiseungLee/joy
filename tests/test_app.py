import importlib.util
import tempfile
import unittest
from pathlib import Path


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
            "memo": "다시 가기",
            "latitude": 37.57,
            "longitude": 126.98,
        })
        self.assertEqual(created["label"], "테스트 장소")
        self.assertFalse(created["location_cache_stale"])

        filtered = app.list_places({"country_code": ["KR"], "district": ["종로구"]})
        self.assertEqual(len(filtered), 1)

        updated = app.update_place(created["id"], {"memo": "수정한 메모"})
        self.assertEqual(updated["memo"], "수정한 메모")

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

    def test_signed_session_expiry_and_tampering(self):
        token = app.make_session_token("tester")
        self.assertEqual(app.verify_session_token(token), "tester")
        self.assertIsNone(app.verify_session_token(token + "x"))


if __name__ == "__main__":
    unittest.main()
