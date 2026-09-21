# 구조와 데이터 설계

## 구성

- `app.py`: Python 표준 라이브러리만 사용하는 HTTP/API 서버
- `static/`: Google Maps JavaScript API 기반 단일 페이지 앱
- `data/joy-map.db`: SQLite 데이터베이스와 WAL 파일
- `docker-compose.yml`: Synology Container Manager용 실행 구성

외부 패키지를 설치하지 않아 이미지가 작고, 의존성 업데이트로 인한 유지보수 부담이 적습니다. 단일 개인 사용자 규모에서는 Python의 스레드 HTTP 서버와 SQLite WAL 모드로 충분합니다.

## 저장 모델

`categories`는 이름·색상·slug를 독립 테이블로 관리합니다. `places.category_id`가 이 테이블을 참조하므로 카테고리를 계속 추가할 수 있습니다.

`places`의 핵심 필드는 다음과 같습니다.

| 필드 | 용도 |
|---|---|
| `provider`, `provider_place_id` | Google Place ID 또는 직접 지정 좌표 ID |
| `label`, `memo` | 사용자가 확인·작성한 개인 데이터 |
| `country_code`, `region`, `locality`, `district` | 전 세계 지역 필터용 사용자 태그 |
| `latitude`, `longitude`, `location_cached_at` | 마커용 29일 좌표 캐시 |
| `category_id` | 확장 가능한 카테고리 참조 |

Google 장소명·주소·전화번호 등 Places 콘텐츠는 데이터베이스에 저장하지 않습니다. 검색 화면에서만 표시하고, 저장 시에는 사용자가 확인한 별도 이름과 지역 태그로 취급합니다. Place ID는 Google 문서상 장기 저장할 수 있습니다.

## 보안

- HMAC 서명, 만료 시간이 있는 HttpOnly·SameSite 세션 쿠키
- 로그인 IP별 단순 시도 제한
- 모든 변경 API에 사용자 정의 요청 헤더 요구
- CSP, frame 차단, MIME 스니핑 차단 헤더
- 컨테이너 권한 제거, 읽기 전용 루트 파일시스템, 로컬 포트 바인딩
- Google 키는 도메인·API 제한을 전제로 브라우저에 제공

이 구성은 개인 서비스용입니다. 다중 사용자 계정, 공유, 권한별 접근이 필요하면 사용자 테이블·비밀번호 해시·CSRF 토큰·감사 로그를 추가해야 합니다.
