#!/usr/bin/env python3
"""JOY MAP - dependency-free personal place map server.

The server deliberately stores only a Google Place ID, user-authored fields, and a
short-lived coordinate cache. Google place names/addresses stay in the browser.
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import json
import math
import mimetypes
import os
import re
import secrets
import sqlite3
import sys
import threading
import time
import uuid
from contextlib import contextmanager
from datetime import datetime, timedelta, timezone
from http import HTTPStatus
from http.cookies import SimpleCookie
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import parse_qs, urlencode, urlparse
from urllib.request import Request, urlopen


BASE_DIR = Path(__file__).resolve().parent
STATIC_DIR = BASE_DIR / "static"
DATA_DIR = Path(os.getenv("DATA_DIR", str(BASE_DIR / "data"))).resolve()
DB_PATH = DATA_DIR / "joy-map.db"
HOST = os.getenv("APP_HOST", "0.0.0.0")
PORT = int(os.getenv("APP_PORT", "8080"))
APP_USERNAME = os.getenv("APP_USERNAME", "admin")
APP_PASSWORD = os.getenv("APP_PASSWORD", "")
SECRET_KEY = os.getenv("SECRET_KEY", "")
GOOGLE_MAPS_API_KEY = os.getenv("GOOGLE_MAPS_API_KEY", "")
GOOGLE_MAP_ID = os.getenv("GOOGLE_MAP_ID", "DEMO_MAP_ID")
KAKAO_REST_API_KEY = os.getenv("KAKAO_REST_API_KEY", "")
COOKIE_SECURE = os.getenv("COOKIE_SECURE", "false").lower() in {"1", "true", "yes", "on"}
SESSION_HOURS = max(1, min(720, int(os.getenv("SESSION_HOURS", "168"))))
COORDINATE_CACHE_DAYS = 29
MAX_BODY_BYTES = 1_000_000

DB_LOCK = threading.RLock()
LOGIN_ATTEMPTS: dict[str, list[float]] = {}
LOGIN_LOCK = threading.Lock()

COLOR_RE = re.compile(r"^#[0-9a-fA-F]{6}$")
SAFE_SLUG_RE = re.compile(r"[^a-z0-9]+")


class ApiError(Exception):
    def __init__(self, status: int, message: str):
        super().__init__(message)
        self.status = status
        self.message = message


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def iso_now() -> str:
    return utc_now().isoformat(timespec="seconds")


def parse_iso(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
        if parsed.tzinfo is None:
            parsed = parsed.replace(tzinfo=timezone.utc)
        return parsed.astimezone(timezone.utc)
    except (TypeError, ValueError):
        return None


def b64url_encode(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).decode("ascii").rstrip("=")


def b64url_decode(value: str) -> bytes:
    return base64.urlsafe_b64decode(value + "=" * (-len(value) % 4))


def make_session_token(username: str) -> str:
    payload = json.dumps(
        {"u": username, "exp": int(time.time()) + SESSION_HOURS * 3600},
        separators=(",", ":"),
    ).encode("utf-8")
    encoded = b64url_encode(payload)
    signature = hmac.new(SECRET_KEY.encode("utf-8"), encoded.encode("ascii"), hashlib.sha256).digest()
    return f"{encoded}.{b64url_encode(signature)}"


def verify_session_token(token: str) -> str | None:
    try:
        encoded, provided = token.rsplit(".", 1)
        expected = hmac.new(
            SECRET_KEY.encode("utf-8"), encoded.encode("ascii"), hashlib.sha256
        ).digest()
        if not hmac.compare_digest(expected, b64url_decode(provided)):
            return None
        payload = json.loads(b64url_decode(encoded).decode("utf-8"))
        if payload.get("u") != APP_USERNAME or int(payload.get("exp", 0)) < int(time.time()):
            return None
        return str(payload["u"])
    except (ValueError, TypeError, KeyError, json.JSONDecodeError):
        return None


def db_connect() -> sqlite3.Connection:
    connection = sqlite3.connect(DB_PATH, timeout=10)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA foreign_keys = ON")
    connection.execute("PRAGMA busy_timeout = 5000")
    return connection


@contextmanager
def database():
    connection = db_connect()
    try:
        yield connection
        connection.commit()
    except Exception:
        connection.rollback()
        raise
    finally:
        connection.close()


def init_database() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    with DB_LOCK, database() as db:
        db.execute("PRAGMA journal_mode = WAL")
        db.executescript(
            """
            CREATE TABLE IF NOT EXISTS categories (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                slug TEXT NOT NULL UNIQUE,
                name TEXT NOT NULL UNIQUE,
                color TEXT NOT NULL,
                created_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS places (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                provider TEXT NOT NULL CHECK(provider IN ('google', 'manual')),
                provider_place_id TEXT NOT NULL,
                label TEXT NOT NULL,
                category_id INTEGER NOT NULL REFERENCES categories(id) ON DELETE RESTRICT,
                country_code TEXT NOT NULL DEFAULT '',
                region TEXT NOT NULL DEFAULT '',
                locality TEXT NOT NULL DEFAULT '',
                district TEXT NOT NULL DEFAULT '',
                planned_month INTEGER,
                memo TEXT NOT NULL DEFAULT '',
                latitude REAL,
                longitude REAL,
                location_cached_at TEXT,
                place_id_refreshed_at TEXT,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                UNIQUE(provider, provider_place_id)
            );

            CREATE INDEX IF NOT EXISTS idx_places_category ON places(category_id);
            CREATE INDEX IF NOT EXISTS idx_places_region ON places(country_code, region, locality, district);
            CREATE INDEX IF NOT EXISTS idx_places_updated ON places(updated_at DESC);
            """
        )
        place_columns = {
            row["name"] for row in db.execute("PRAGMA table_info(places)").fetchall()
        }
        if "planned_month" not in place_columns:
            db.execute("ALTER TABLE places ADD COLUMN planned_month INTEGER")
        db.execute("CREATE INDEX IF NOT EXISTS idx_places_planned_month ON places(planned_month)")
        now = iso_now()
        db.executemany(
            "INSERT OR IGNORE INTO categories(slug, name, color, created_at) VALUES (?, ?, ?, ?)",
            [
                ("restaurant", "맛집", "#E85D3F", now),
                ("attraction", "명소", "#2D6CDF", now),
            ],
        )


def text(value: object, limit: int, field: str, required: bool = False) -> str:
    result = str(value or "").strip()
    if required and not result:
        raise ApiError(HTTPStatus.BAD_REQUEST, f"{field} 항목은 필수입니다.")
    if len(result) > limit:
        raise ApiError(HTTPStatus.BAD_REQUEST, f"{field} 항목은 {limit}자 이하여야 합니다.")
    return result


def number(value: object, field: str, minimum: float, maximum: float) -> float:
    try:
        parsed = float(value)
    except (TypeError, ValueError):
        raise ApiError(HTTPStatus.BAD_REQUEST, f"{field} 값이 올바르지 않습니다.") from None
    if not minimum <= parsed <= maximum:
        raise ApiError(HTTPStatus.BAD_REQUEST, f"{field} 값의 범위를 확인해 주세요.")
    return parsed


def row_to_place(row: sqlite3.Row) -> dict:
    payload = dict(row)
    cached_at = parse_iso(payload.get("location_cached_at"))
    payload["location_cache_stale"] = (
        payload.get("provider") == "google"
        and (cached_at is None or cached_at + timedelta(days=COORDINATE_CACHE_DAYS) <= utc_now())
    )
    return payload


def get_category(db: sqlite3.Connection, category_id: int) -> sqlite3.Row:
    row = db.execute("SELECT * FROM categories WHERE id = ?", (category_id,)).fetchone()
    if not row:
        raise ApiError(HTTPStatus.BAD_REQUEST, "선택한 카테고리가 존재하지 않습니다.")
    return row


def list_categories() -> list[dict]:
    with database() as db:
        rows = db.execute(
            """
            SELECT c.*, COUNT(p.id) AS place_count
            FROM categories c LEFT JOIN places p ON p.category_id = c.id
            GROUP BY c.id ORDER BY c.id
            """
        ).fetchall()
    return [dict(row) for row in rows]


def create_category(data: dict) -> dict:
    name = text(data.get("name"), 30, "카테고리 이름", required=True)
    color = text(data.get("color"), 7, "색상", required=True)
    if not COLOR_RE.fullmatch(color):
        raise ApiError(HTTPStatus.BAD_REQUEST, "색상은 #RRGGBB 형식이어야 합니다.")
    base_slug = SAFE_SLUG_RE.sub("-", text(data.get("slug") or name.lower(), 40, "slug")).strip("-")
    slug = base_slug or f"category-{uuid.uuid4().hex[:8]}"
    try:
        with DB_LOCK, database() as db:
            cursor = db.execute(
                "INSERT INTO categories(slug, name, color, created_at) VALUES (?, ?, ?, ?)",
                (slug, name, color.upper(), iso_now()),
            )
            row = db.execute("SELECT *, 0 AS place_count FROM categories WHERE id = ?", (cursor.lastrowid,)).fetchone()
    except sqlite3.IntegrityError:
        raise ApiError(HTTPStatus.CONFLICT, "같은 이름의 카테고리가 이미 있습니다.") from None
    return dict(row)


def delete_category(category_id: int) -> None:
    with DB_LOCK, database() as db:
        row = db.execute("SELECT slug FROM categories WHERE id = ?", (category_id,)).fetchone()
        if not row:
            raise ApiError(HTTPStatus.NOT_FOUND, "카테고리를 찾을 수 없습니다.")
        if row["slug"] in {"restaurant", "attraction"}:
            raise ApiError(HTTPStatus.CONFLICT, "기본 카테고리는 삭제할 수 없습니다.")
        try:
            db.execute("DELETE FROM categories WHERE id = ?", (category_id,))
        except sqlite3.IntegrityError:
            raise ApiError(HTTPStatus.CONFLICT, "이 카테고리를 사용하는 장소가 있어 삭제할 수 없습니다.") from None


PLACE_SELECT = """
    SELECT p.*, c.name AS category_name, c.slug AS category_slug, c.color AS category_color
    FROM places p JOIN categories c ON c.id = p.category_id
"""


def list_places(params: dict[str, list[str]]) -> list[dict]:
    where: list[str] = []
    values: list[object] = []
    filters = {
        "category_id": "p.category_id = ?",
        "country_code": "p.country_code = ?",
        "region": "p.region = ?",
        "locality": "p.locality = ?",
        "district": "p.district = ?",
        "planned_month": "p.planned_month = ?",
    }
    for key, clause in filters.items():
        value = (params.get(key) or [""])[0].strip()
        if value:
            where.append(clause)
            values.append(int(value) if key in {"category_id", "planned_month"} else value)
    scope = (params.get("scope") or [""])[0].strip()
    if scope == "domestic":
        where.append("UPPER(p.country_code) = 'KR'")
    elif scope == "international":
        where.append("p.country_code <> '' AND UPPER(p.country_code) <> 'KR'")
    query = (params.get("q") or [""])[0].strip()
    if query:
        where.append(
            "(p.label LIKE ? OR p.memo LIKE ? OR p.region LIKE ? "
            "OR p.locality LIKE ? OR p.district LIKE ?)"
        )
        term = f"%{query[:100]}%"
        values.extend([term, term, term, term, term])
    area_query = (params.get("area_q") or [""])[0].strip()
    if area_query:
        where.append("(p.region LIKE ? OR p.locality LIKE ? OR p.district LIKE ?)")
        area_term = f"%{area_query[:100]}%"
        values.extend([area_term, area_term, area_term])
    sql = PLACE_SELECT
    if where:
        sql += " WHERE " + " AND ".join(where)
    sql += " ORDER BY p.updated_at DESC, p.id DESC"
    with database() as db:
        rows = db.execute(sql, values).fetchall()
    return [row_to_place(row) for row in rows]


def list_regions() -> dict:
    with database() as db:
        rows = db.execute(
            """
            SELECT DISTINCT country_code, region, locality, district
            FROM places
            WHERE country_code <> '' OR region <> '' OR locality <> '' OR district <> ''
            ORDER BY country_code, region, locality, district
            """
        ).fetchall()
    return {"regions": [dict(row) for row in rows]}


def validate_place(data: dict, existing: sqlite3.Row | None = None) -> dict:
    provider = text(data.get("provider", existing["provider"] if existing else "google"), 20, "공급자", required=True)
    if provider not in {"google", "manual"}:
        raise ApiError(HTTPStatus.BAD_REQUEST, "지원하지 않는 지도 공급자입니다.")
    provider_place_id = text(
        data.get("provider_place_id", existing["provider_place_id"] if existing else ""),
        300,
        "장소 ID",
        required=True,
    )
    if provider == "manual" and not provider_place_id.startswith("manual:"):
        raise ApiError(HTTPStatus.BAD_REQUEST, "직접 지정한 장소 ID가 올바르지 않습니다.")
    try:
        category_id = int(data.get("category_id", existing["category_id"] if existing else 0))
    except (TypeError, ValueError):
        raise ApiError(HTTPStatus.BAD_REQUEST, "카테고리가 올바르지 않습니다.") from None

    def current(key: str, default: object = "") -> object:
        if key in data:
            return data[key]
        return existing[key] if existing is not None else default

    latitude = current("latitude", None)
    longitude = current("longitude", None)
    if latitude is not None and longitude is not None:
        latitude = number(latitude, "위도", -90, 90)
        longitude = number(longitude, "경도", -180, 180)
    else:
        latitude = longitude = None
    planned_month_raw = current("planned_month", None)
    if planned_month_raw is None or planned_month_raw == "":
        planned_month = None
    else:
        try:
            planned_month = int(planned_month_raw)
        except (TypeError, ValueError):
            raise ApiError(HTTPStatus.BAD_REQUEST, "방문 예정 월이 올바르지 않습니다.") from None
        if not 1 <= planned_month <= 12:
            raise ApiError(HTTPStatus.BAD_REQUEST, "방문 예정 월은 1월부터 12월 사이여야 합니다.")
    return {
        "provider": provider,
        "provider_place_id": provider_place_id,
        "label": text(current("label"), 120, "저장 이름", required=True),
        "category_id": category_id,
        "country_code": text(current("country_code"), 10, "국가 코드").upper(),
        "region": text(current("region"), 100, "주·도"),
        "locality": text(current("locality"), 100, "도시·시군구"),
        "district": text(current("district"), 100, "세부 지역"),
        "planned_month": planned_month,
        "memo": text(current("memo"), 5000, "메모"),
        "latitude": latitude,
        "longitude": longitude,
    }


def create_place(data: dict) -> dict:
    with DB_LOCK, database() as db:
        values = validate_place(data)
        get_category(db, values["category_id"])
        now = iso_now()
        cached_at = now if values["latitude"] is not None else None
        try:
            cursor = db.execute(
                """
                INSERT INTO places(
                    provider, provider_place_id, label, category_id, country_code,
                    region, locality, district, planned_month, memo, latitude, longitude,
                    location_cached_at, place_id_refreshed_at, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    values["provider"], values["provider_place_id"], values["label"],
                    values["category_id"], values["country_code"], values["region"],
                    values["locality"], values["district"], values["planned_month"], values["memo"],
                    values["latitude"], values["longitude"], cached_at,
                    now if values["provider"] == "google" else None, now, now,
                ),
            )
        except sqlite3.IntegrityError:
            raise ApiError(HTTPStatus.CONFLICT, "이미 저장한 장소입니다.") from None
        row = db.execute(PLACE_SELECT + " WHERE p.id = ?", (cursor.lastrowid,)).fetchone()
    return row_to_place(row)


def update_place(place_id: int, data: dict) -> dict:
    with DB_LOCK, database() as db:
        existing = db.execute("SELECT * FROM places WHERE id = ?", (place_id,)).fetchone()
        if not existing:
            raise ApiError(HTTPStatus.NOT_FOUND, "장소를 찾을 수 없습니다.")
        values = validate_place(data, existing)
        get_category(db, values["category_id"])
        db.execute(
            """
            UPDATE places SET label=?, category_id=?, country_code=?, region=?, locality=?,
                district=?, planned_month=?, memo=?, updated_at=? WHERE id=?
            """,
            (
                values["label"], values["category_id"], values["country_code"],
                values["region"], values["locality"], values["district"],
                values["planned_month"], values["memo"], iso_now(), place_id,
            ),
        )
        row = db.execute(PLACE_SELECT + " WHERE p.id = ?", (place_id,)).fetchone()
    return row_to_place(row)


def update_location_cache(place_id: int, data: dict) -> dict:
    latitude = number(data.get("latitude"), "위도", -90, 90)
    longitude = number(data.get("longitude"), "경도", -180, 180)
    with DB_LOCK, database() as db:
        existing = db.execute("SELECT * FROM places WHERE id = ?", (place_id,)).fetchone()
        if not existing:
            raise ApiError(HTTPStatus.NOT_FOUND, "장소를 찾을 수 없습니다.")
        if existing["provider"] != "google":
            raise ApiError(HTTPStatus.BAD_REQUEST, "Google 장소에만 캐시를 갱신할 수 있습니다.")
        now = iso_now()
        db.execute(
            """
            UPDATE places SET latitude=?, longitude=?, location_cached_at=?,
                place_id_refreshed_at=? WHERE id=?
            """,
            (latitude, longitude, now, now, place_id),
        )
        row = db.execute(PLACE_SELECT + " WHERE p.id = ?", (place_id,)).fetchone()
    return row_to_place(row)


def delete_place(place_id: int) -> None:
    with DB_LOCK, database() as db:
        cursor = db.execute("DELETE FROM places WHERE id = ?", (place_id,))
        if cursor.rowcount == 0:
            raise ApiError(HTTPStatus.NOT_FOUND, "장소를 찾을 수 없습니다.")


def export_data() -> dict:
    return {
        "exported_at": iso_now(),
        "schema_version": 2,
        "categories": list_categories(),
        "places": list_places({}),
        "note": "Google 장소의 이름/주소는 정책상 저장하지 않으며 place ID와 사용자 입력만 포함합니다.",
    }


def validate_route_points(raw_points: object) -> list[dict]:
    if not isinstance(raw_points, list) or not 2 <= len(raw_points) <= 27:
        raise ApiError(HTTPStatus.BAD_REQUEST, "경로 장소는 2곳 이상 27곳 이하로 선택해 주세요.")
    points = []
    for raw_point in raw_points:
        if not isinstance(raw_point, dict):
            raise ApiError(HTTPStatus.BAD_REQUEST, "경로 좌표 형식을 확인해 주세요.")
        try:
            latitude = float(raw_point.get("latitude"))
            longitude = float(raw_point.get("longitude"))
        except (TypeError, ValueError):
            raise ApiError(HTTPStatus.BAD_REQUEST, "경로 좌표 형식을 확인해 주세요.") from None
        if not math.isfinite(latitude) or not math.isfinite(longitude):
            raise ApiError(HTTPStatus.BAD_REQUEST, "경로 좌표 형식을 확인해 주세요.")
        if not -90 <= latitude <= 90 or not -180 <= longitude <= 180:
            raise ApiError(HTTPStatus.BAD_REQUEST, "경로 좌표 범위를 확인해 주세요.")
        points.append({
            "latitude": latitude,
            "longitude": longitude,
            "label": str(raw_point.get("label", ""))[:100],
        })
    return points


def request_kakao_api(path: str, *, params: dict | None = None, payload: dict | None = None) -> dict:
    if not KAKAO_REST_API_KEY:
        raise ApiError(
            HTTPStatus.SERVICE_UNAVAILABLE,
            "국내 자동차 길찾기에 필요한 카카오 REST API 키가 아직 설정되지 않았습니다.",
        )
    url = f"https://apis-navi.kakaomobility.com{path}"
    if params:
        url = f"{url}?{urlencode(params)}"
    body = json.dumps(payload, ensure_ascii=False).encode("utf-8") if payload is not None else None
    request = Request(
        url,
        data=body,
        method="POST" if payload is not None else "GET",
        headers={
            "Authorization": f"KakaoAK {KAKAO_REST_API_KEY}",
            "Content-Type": "application/json",
            "User-Agent": "JoyMap/1.0",
        },
    )
    try:
        with urlopen(request, timeout=15) as response:
            return json.loads(response.read().decode("utf-8"))
    except HTTPError as error:
        if error.code in {401, 403}:
            message = "카카오 REST API 키 또는 호출 허용 IP 설정을 확인해 주세요."
        elif error.code == 429:
            message = "카카오 자동차 길찾기 사용 한도에 도달했습니다."
        else:
            message = f"카카오 자동차 길찾기 요청이 실패했습니다. (HTTP {error.code})"
        raise ApiError(HTTPStatus.BAD_GATEWAY, message) from None
    except (URLError, TimeoutError, json.JSONDecodeError):
        raise ApiError(HTTPStatus.BAD_GATEWAY, "카카오 자동차 길찾기 서버에 연결하지 못했습니다.") from None


def kakao_route_chunk(points: list[dict]) -> dict:
    params = {
        "origin": f'{points[0]["longitude"]},{points[0]["latitude"]}',
        "destination": f'{points[-1]["longitude"]},{points[-1]["latitude"]}',
        "priority": "RECOMMEND",
        "summary": "false",
        "alternatives": "false",
        "road_details": "false",
    }
    if len(points) > 2:
        params["waypoints"] = "|".join(
            f'{point["longitude"]},{point["latitude"]}' for point in points[1:-1]
        )
    data = request_kakao_api("/v1/directions", params=params)
    routes = data.get("routes") if isinstance(data, dict) else None
    route = routes[0] if isinstance(routes, list) and routes else None
    if not isinstance(route, dict) or route.get("result_code") != 0:
        detail = route.get("result_msg") if isinstance(route, dict) else "경로 없음"
        raise ApiError(HTTPStatus.UNPROCESSABLE_ENTITY, f"국내 자동차 경로를 찾지 못했습니다. ({detail})")
    path: list[list[float]] = []
    for section in route.get("sections", []):
        for road in section.get("roads", []):
            vertices = road.get("vertexes", [])
            for index in range(0, len(vertices) - 1, 2):
                point = [float(vertices[index + 1]), float(vertices[index])]
                if not path or path[-1] != point:
                    path.append(point)
    summary = route.get("summary", {})
    return {
        "path": path,
        "distance_meters": int(summary.get("distance", 0)),
        "duration_millis": int(summary.get("duration", 0)) * 1000,
    }


def kakao_route_costs(points: list[dict]) -> list[list[float]]:
    size = len(points)
    costs = [[0.0 if origin == destination else math.inf for destination in range(size)] for origin in range(size)]
    for origin_index, origin in enumerate(points):
        destinations = [
            {
                "x": destination["longitude"],
                "y": destination["latitude"],
                "key": str(destination_index),
            }
            for destination_index, destination in enumerate(points)
            if destination_index != origin_index
        ]
        data = request_kakao_api(
            "/v1/destinations/directions",
            payload={
                "origin": {"x": origin["longitude"], "y": origin["latitude"]},
                "destinations": destinations,
                "radius": 10000,
                "priority": "TIME",
            },
        )
        for route in data.get("routes", []):
            if route.get("result_code") != 0:
                continue
            try:
                destination_index = int(route.get("key"))
                duration = float(route.get("summary", {}).get("duration"))
            except (TypeError, ValueError):
                continue
            if 0 <= destination_index < size and math.isfinite(duration):
                costs[origin_index][destination_index] = duration
    return costs


def optimal_open_route_order(costs: list[list[float]]) -> list[int]:
    size = len(costs)
    state_count = 1 << size
    best = [[math.inf] * size for _ in range(state_count)]
    previous = [[-1] * size for _ in range(state_count)]
    for start in range(size):
        best[1 << start][start] = 0
    for mask in range(1, state_count):
        for last in range(size):
            current = best[mask][last]
            if not math.isfinite(current):
                continue
            for next_index in range(size):
                if mask & (1 << next_index):
                    continue
                next_cost = current + costs[last][next_index]
                next_mask = mask | (1 << next_index)
                if next_cost < best[next_mask][next_index]:
                    best[next_mask][next_index] = next_cost
                    previous[next_mask][next_index] = last
    full_mask = state_count - 1
    last = min(range(size), key=lambda index: best[full_mask][index])
    if not math.isfinite(best[full_mask][last]):
        raise ApiError(HTTPStatus.UNPROCESSABLE_ENTITY, "선택한 장소를 모두 연결하는 국내 자동차 경로가 없습니다.")
    order = []
    mask = full_mask
    while last >= 0:
        order.append(last)
        next_last = previous[mask][last]
        mask ^= 1 << last
        last = next_last
    return list(reversed(order))


def plan_domestic_driving_route(raw_points: object, optimize: bool = False) -> dict:
    points = validate_route_points(raw_points)
    if optimize and len(points) > 10:
        raise ApiError(HTTPStatus.BAD_REQUEST, "순서 무관 최적화는 최대 10곳까지 지원합니다.")
    order = optimal_open_route_order(kakao_route_costs(points)) if optimize else list(range(len(points)))
    ordered_points = [points[index] for index in order]
    full_path: list[list[float]] = []
    distance_meters = 0
    duration_millis = 0
    for start in range(0, len(ordered_points) - 1, 6):
        chunk = ordered_points[start:start + 7]
        route = kakao_route_chunk(chunk)
        if full_path and route["path"] and full_path[-1] == route["path"][0]:
            full_path.extend(route["path"][1:])
        else:
            full_path.extend(route["path"])
        distance_meters += route["distance_meters"]
        duration_millis += route["duration_millis"]
    if not full_path:
        raise ApiError(HTTPStatus.UNPROCESSABLE_ENTITY, "국내 자동차 경로 선을 생성하지 못했습니다.")
    return {
        "provider": "kakao",
        "order": order,
        "path": full_path,
        "distanceMeters": distance_meters,
        "durationMillis": duration_millis,
    }


class JoyMapHandler(BaseHTTPRequestHandler):
    server_version = "JoyMap/1.0"

    def log_message(self, fmt: str, *args: object) -> None:
        sys.stdout.write(f"{self.log_date_time_string()} {self.address_string()} {fmt % args}\n")

    def end_headers(self) -> None:
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Referrer-Policy", "strict-origin-when-cross-origin")
        self.send_header("X-Frame-Options", "DENY")
        self.send_header("Permissions-Policy", "camera=(), microphone=(), geolocation=(self)")
        self.send_header(
            "Content-Security-Policy",
            "default-src 'self'; "
            "script-src 'self' https://maps.googleapis.com https://maps.gstatic.com; "
            "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; "
            "font-src 'self' https://fonts.gstatic.com data:; "
            "img-src 'self' data: blob: https://*.googleapis.com https://*.gstatic.com https://*.google.com https://*.googleusercontent.com; "
            "connect-src 'self' https://*.googleapis.com https://maps.gstatic.com https://*.google.com; "
            "frame-src https://*.google.com; object-src 'none'; base-uri 'self'; form-action 'self'",
        )
        super().end_headers()

    def do_OPTIONS(self) -> None:
        self.send_response(HTTPStatus.NO_CONTENT)
        self.end_headers()

    def do_GET(self) -> None:
        parsed = urlparse(self.path)
        try:
            if parsed.path == "/api/health":
                self.send_json({
                    "status": "ok",
                    "maps_configured": bool(GOOGLE_MAPS_API_KEY),
                    "domestic_driving_configured": bool(KAKAO_REST_API_KEY),
                })
                return
            if parsed.path.startswith("/api/"):
                self.require_auth()
                self.handle_api_get(parsed.path, parse_qs(parsed.query))
                return
            self.serve_static(parsed.path)
        except ApiError as error:
            self.send_json({"error": error.message}, error.status)
        except Exception as error:  # pragma: no cover - defensive server boundary
            print(f"Unhandled GET error: {error}", file=sys.stderr)
            self.send_json({"error": "서버에서 요청을 처리하지 못했습니다."}, 500)

    def do_POST(self) -> None:
        parsed = urlparse(self.path)
        try:
            data = self.read_json()
            if parsed.path == "/api/login":
                self.handle_login(data)
                return
            self.require_auth()
            self.require_same_site_request()
            if parsed.path == "/api/logout":
                self.send_json(
                    {"ok": True},
                    headers={"Set-Cookie": self.session_cookie("", max_age=0)},
                )
            elif parsed.path == "/api/categories":
                self.send_json({"category": create_category(data)}, HTTPStatus.CREATED)
            elif parsed.path == "/api/places":
                self.send_json({"place": create_place(data)}, HTTPStatus.CREATED)
            elif parsed.path == "/api/routes/driving":
                self.send_json({
                    "route": plan_domestic_driving_route(
                        data.get("points"),
                        bool(data.get("optimize", False)),
                    )
                })
            else:
                raise ApiError(HTTPStatus.NOT_FOUND, "요청한 API를 찾을 수 없습니다.")
        except ApiError as error:
            self.send_json({"error": error.message}, error.status)
        except Exception as error:
            print(f"Unhandled POST error: {error}", file=sys.stderr)
            self.send_json({"error": "서버에서 요청을 처리하지 못했습니다."}, 500)

    def do_PUT(self) -> None:
        parsed = urlparse(self.path)
        try:
            self.require_auth()
            self.require_same_site_request()
            data = self.read_json()
            match = re.fullmatch(r"/api/places/(\d+)", parsed.path)
            cache_match = re.fullmatch(r"/api/places/(\d+)/location-cache", parsed.path)
            if cache_match:
                self.send_json({"place": update_location_cache(int(cache_match.group(1)), data)})
            elif match:
                self.send_json({"place": update_place(int(match.group(1)), data)})
            else:
                raise ApiError(HTTPStatus.NOT_FOUND, "요청한 API를 찾을 수 없습니다.")
        except ApiError as error:
            self.send_json({"error": error.message}, error.status)
        except Exception as error:
            print(f"Unhandled PUT error: {error}", file=sys.stderr)
            self.send_json({"error": "서버에서 요청을 처리하지 못했습니다."}, 500)

    def do_DELETE(self) -> None:
        parsed = urlparse(self.path)
        try:
            self.require_auth()
            self.require_same_site_request()
            place_match = re.fullmatch(r"/api/places/(\d+)", parsed.path)
            category_match = re.fullmatch(r"/api/categories/(\d+)", parsed.path)
            if place_match:
                delete_place(int(place_match.group(1)))
            elif category_match:
                delete_category(int(category_match.group(1)))
            else:
                raise ApiError(HTTPStatus.NOT_FOUND, "요청한 API를 찾을 수 없습니다.")
            self.send_json({"ok": True})
        except ApiError as error:
            self.send_json({"error": error.message}, error.status)
        except Exception as error:
            print(f"Unhandled DELETE error: {error}", file=sys.stderr)
            self.send_json({"error": "서버에서 요청을 처리하지 못했습니다."}, 500)

    def handle_api_get(self, path: str, params: dict[str, list[str]]) -> None:
        if path == "/api/session":
            self.send_json({"authenticated": True, "username": APP_USERNAME})
        elif path == "/api/config":
            self.send_json(
                {
                    "provider": "google",
                    "maps_api_key": GOOGLE_MAPS_API_KEY,
                    "map_id": GOOGLE_MAP_ID,
                    "configured": bool(GOOGLE_MAPS_API_KEY),
                    "kakao_driving_configured": bool(KAKAO_REST_API_KEY),
                    "coordinate_cache_days": COORDINATE_CACHE_DAYS,
                }
            )
        elif path == "/api/categories":
            self.send_json({"categories": list_categories()})
        elif path == "/api/places":
            self.send_json({"places": list_places(params)})
        elif path == "/api/regions":
            self.send_json(list_regions())
        elif path == "/api/export":
            timestamp = utc_now().strftime("%Y%m%d-%H%M%S")
            self.send_json(
                export_data(),
                headers={"Content-Disposition": f'attachment; filename="joy-map-{timestamp}.json"'},
            )
        else:
            raise ApiError(HTTPStatus.NOT_FOUND, "요청한 API를 찾을 수 없습니다.")

    def handle_login(self, data: dict) -> None:
        ip = self.client_address[0]
        now = time.time()
        with LOGIN_LOCK:
            recent = [attempt for attempt in LOGIN_ATTEMPTS.get(ip, []) if now - attempt < 300]
            LOGIN_ATTEMPTS[ip] = recent
            if len(recent) >= 10:
                raise ApiError(HTTPStatus.TOO_MANY_REQUESTS, "잠시 후 다시 로그인해 주세요.")
        password = str(data.get("password", ""))
        valid = hmac.compare_digest(password, APP_PASSWORD)
        if not valid:
            with LOGIN_LOCK:
                LOGIN_ATTEMPTS.setdefault(ip, []).append(now)
            raise ApiError(HTTPStatus.UNAUTHORIZED, "비밀번호를 확인해 주세요.")
        with LOGIN_LOCK:
            LOGIN_ATTEMPTS.pop(ip, None)
        token = make_session_token(APP_USERNAME)
        self.send_json(
            {"authenticated": True, "username": APP_USERNAME},
            headers={"Set-Cookie": self.session_cookie(token, SESSION_HOURS * 3600)},
        )

    def require_auth(self) -> str:
        cookie = SimpleCookie(self.headers.get("Cookie", ""))
        morsel = cookie.get("joy_session")
        user = verify_session_token(morsel.value) if morsel else None
        if not user:
            raise ApiError(HTTPStatus.UNAUTHORIZED, "로그인이 필요합니다.")
        return user

    def require_same_site_request(self) -> None:
        if self.headers.get("X-Requested-With") != "JoyMap":
            raise ApiError(HTTPStatus.FORBIDDEN, "허용되지 않은 요청입니다.")

    def session_cookie(self, value: str, max_age: int) -> str:
        secure = "; Secure" if COOKIE_SECURE else ""
        return (
            f"joy_session={value}; Path=/; Max-Age={max_age}; HttpOnly; "
            f"SameSite=Lax{secure}"
        )

    def read_json(self) -> dict:
        try:
            length = int(self.headers.get("Content-Length", "0"))
        except ValueError:
            raise ApiError(HTTPStatus.BAD_REQUEST, "요청 크기가 올바르지 않습니다.") from None
        if length <= 0 or length > MAX_BODY_BYTES:
            raise ApiError(HTTPStatus.BAD_REQUEST, "요청 본문이 없거나 너무 큽니다.")
        if "application/json" not in self.headers.get("Content-Type", ""):
            raise ApiError(HTTPStatus.UNSUPPORTED_MEDIA_TYPE, "JSON 요청만 지원합니다.")
        try:
            payload = json.loads(self.rfile.read(length).decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError):
            raise ApiError(HTTPStatus.BAD_REQUEST, "JSON 형식을 확인해 주세요.") from None
        if not isinstance(payload, dict):
            raise ApiError(HTTPStatus.BAD_REQUEST, "JSON 객체가 필요합니다.")
        return payload

    def send_json(
        self,
        payload: dict,
        status: int = HTTPStatus.OK,
        headers: dict[str, str] | None = None,
    ) -> None:
        body = json.dumps(payload, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        for key, value in (headers or {}).items():
            self.send_header(key, value)
        self.end_headers()
        self.wfile.write(body)

    def serve_static(self, path: str) -> None:
        mapping = {
            "/": STATIC_DIR / "index.html",
            "/index.html": STATIC_DIR / "index.html",
            "/app.css": STATIC_DIR / "app.css",
            "/app.js": STATIC_DIR / "app.js",
            "/favicon.svg": STATIC_DIR / "favicon.svg",
            "/privacy.html": STATIC_DIR / "privacy.html",
            "/terms.html": STATIC_DIR / "terms.html",
        }
        file_path = mapping.get(path)
        if not file_path or not file_path.is_file():
            raise ApiError(HTTPStatus.NOT_FOUND, "페이지를 찾을 수 없습니다.")
        body = file_path.read_bytes()
        content_type = mimetypes.guess_type(str(file_path))[0] or "application/octet-stream"
        self.send_response(HTTPStatus.OK)
        self.send_header("Content-Type", f"{content_type}; charset=utf-8" if content_type.startswith("text/") else content_type)
        self.send_header("Content-Length", str(len(body)))
        if file_path.suffix in {".html", ".js", ".css"}:
            self.send_header("Cache-Control", "no-cache, no-store, must-revalidate")
            self.send_header("Pragma", "no-cache")
            self.send_header("Expires", "0")
        else:
            self.send_header("Cache-Control", "public, max-age=3600")
        self.end_headers()
        self.wfile.write(body)


def validate_environment() -> None:
    problems = []
    if len(APP_PASSWORD) < 8:
        problems.append("APP_PASSWORD는 8자 이상으로 설정해야 합니다.")
    if len(SECRET_KEY) < 32:
        problems.append("SECRET_KEY는 32자 이상으로 설정해야 합니다.")
    if problems:
        raise SystemExit("\n".join(problems))
    if not GOOGLE_MAPS_API_KEY:
        print("WARNING: GOOGLE_MAPS_API_KEY가 없어 지도와 장소 검색이 비활성화됩니다.", file=sys.stderr)
    if not KAKAO_REST_API_KEY:
        print("WARNING: KAKAO_REST_API_KEY가 없어 국내 자동차 길찾기가 비활성화됩니다.", file=sys.stderr)


def main() -> None:
    validate_environment()
    init_database()
    server = ThreadingHTTPServer((HOST, PORT), JoyMapHandler)
    server.daemon_threads = True
    print(f"JOY MAP listening on http://{HOST}:{PORT}", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
