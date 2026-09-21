# JOY MAP

전 세계의 맛집·명소를 검색해 개인 메모와 지역 태그로 관리하는 Synology용 비공개 지도입니다.

## 제공 기능

- Google Maps 기반 전 세계 장소 검색과 선택
- 지도에 표시된 상호·명소를 클릭해 세부 정보를 확인하고 바로 저장
- 카카오톡·네이버지도·카카오맵 공유문 붙여넣기, 지도 위치 미리보기, 확인 후 저장
- 지도 빈 곳을 우클릭해 임의 좌표 직접 저장
- 맛집·명소 기본 카테고리와 사용자 카테고리 추가
- 국내·해외, 국가, 시·군·구 검색 필터와 지도 마커 동시 갱신
- 방문 예정 월 지정, 월별 목록화 및 필터
- 장소 카드와 지도 마커 롤오버 메모, 선명한 확대 포커스, 수정, 삭제
- 지도 마커·장소 목록을 `Ctrl+클릭`해 자동차·대중교통의 클릭 순서 경로 또는 순서 무관 최적 경로 계산
- `Ctrl` 없이 마우스 휠로 지도 확대·축소
- 브라우저 GPU 호환성을 고려한 명시적 래스터 지도 렌더링
- 로그인 보호, JSON 내보내기, SQLite 영구 저장
- 모바일·데스크톱 반응형 화면

## 권장 구성

```text
인터넷
  → https://joy.lhsstart.synology.me
  → DSM 역방향 프록시·Let's Encrypt 인증서
  → 127.0.0.1:7330
  → JOY MAP 컨테이너
  → ./data/joy-map.db
```

Container Manager를 권장합니다. Web Station만으로는 로그인 API와 SQLite 저장 기능을 실행할 수 없으므로, Web Station을 사용하더라도 이 백엔드 컨테이너 또는 별도 Python 실행 환경이 필요합니다.

## 1. Google Maps 준비

1. [Google Cloud Console](https://console.cloud.google.com/)에서 프로젝트를 만들고 결제 계정을 연결합니다.
2. **Maps JavaScript API**, **Places API (New)**, **Routes API**를 활성화합니다.
3. 사용자 인증 정보에서 API 키를 만듭니다.
4. 애플리케이션 제한을 **웹사이트**로 설정하고 다음 리퍼러만 허용합니다.
   - `https://joy.lhsstart.synology.me/*`
   - 초기 내부 시험이 필요하면 `http://localhost:7330/*`를 임시 추가
5. API 제한을 **Maps JavaScript API**, **Places API (New)**, **Routes API**로 한정합니다.
6. Map Management에서 JavaScript용 Map ID를 만들거나, 첫 시험에는 `DEMO_MAP_ID`를 사용합니다.

API 키는 브라우저에 전달되는 공개 식별자입니다. 비밀로 숨기는 대신 반드시 허용 도메인과 허용 API를 제한해야 합니다.

## 2. Synology Container Manager 배포

1. 이 폴더를 NAS의 `/volume1/docker/joy-map` 같은 위치에 복사합니다.
2. `.env.example`을 `.env`로 복사하고 다음 값을 바꿉니다.
   - `APP_PASSWORD`: 12자 이상의 고유 비밀번호
   - `SECRET_KEY`: `openssl rand -hex 32` 결과
   - `GOOGLE_MAPS_API_KEY`: 제한을 설정한 브라우저 키
   - `GOOGLE_MAP_ID`: 생성한 Map ID
   - `JOY_MAP_UID`, `JOY_MAP_GID`: NAS 배포 계정에서 `id`를 실행해 확인한 숫자 값
3. SSH 터미널에서 해당 폴더로 이동해 실행합니다.

```bash
docker compose up -d --build
docker compose ps
```

Container Manager UI를 사용할 때는 **프로젝트 → 생성 → docker-compose.yml 업로드**로 같은 구성을 실행할 수 있습니다. `.env` 파일과 `data` 폴더가 프로젝트 폴더에 있어야 합니다.

NAS 자체에서 확인할 주소는 `http://127.0.0.1:7330`입니다. 기본 Compose는 보안을 위해 `127.0.0.1`에만 연결합니다. 다른 PC에서 내부 확인이 필요하면 잠시 `127.0.0.1:` 부분을 제거하고 `.env`의 `COOKIE_SECURE=false`로 시험한 뒤, 두 설정을 반드시 원래대로 되돌리세요.

## 3. joy.lhsstart.synology.me 연결

1. 도메인의 A/AAAA 레코드 또는 DDNS가 NAS 공인 주소를 가리키게 합니다.
2. DSM **제어판 → 보안 → 인증서**에서 `joy.lhsstart.synology.me`용 Let's Encrypt 인증서를 발급합니다.
3. DSM **제어판 → 로그인 포털 → 고급 → 역방향 프록시**에서 규칙을 만듭니다.
   - 소스: HTTPS / `joy.lhsstart.synology.me` / 443
   - 대상: HTTP / `localhost` / 7330
4. 생성한 인증서를 해당 호스트에 할당합니다.
5. 공유기에서 외부 443 포트를 NAS로 전달하고 `https://joy.lhsstart.synology.me`로 접속합니다.

운영 환경에서는 `.env`의 `COOKIE_SECURE=true`를 유지하세요.

## 4. 비용 안전장치

개인 사용은 무료 구간 안에 들어갈 가능성이 매우 높지만 결제 계정 연결은 필수입니다.

- Google Cloud Billing에서 소액 예산 알림을 설정합니다. 예산 알림은 자동 차단이 아닙니다.
- Google Maps Platform의 Quotas에서 일일 요청 상한을 직접 낮춥니다.
- 시작 권장값: Dynamic Maps 100회/일, Text Search 100회/일, Place Details 200회/일, Compute Routes 50회/일, Compute Route Matrix 500요소/일.
- API 키의 HTTP 리퍼러와 API 제한을 반드시 적용합니다.
- 공개 회원가입 기능을 두지 말고 긴 로그인 비밀번호를 사용합니다.

현재 앱은 검색 버튼을 누를 때만 Text Search를 호출하고, 저장 장소의 좌표는 29일 동안 재사용한 뒤 Place Details의 `location` 필드만 갱신합니다. 경로 API는 경로 계산 버튼을 눌렀을 때만 호출하며, 순서 무관 최적화는 비용과 계산량을 제한하기 위해 최대 10곳까지만 지원합니다. 대중교통은 선택한 장소 사이를 구간별로 계산해 하나의 경로처럼 표시하며, 실제 제공 여부는 Google이 지원하는 지역·시간대·노선에 따라 달라질 수 있습니다.

## 데이터와 백업

데이터는 `data/joy-map.db`에 저장됩니다. Google 정책을 고려해 다음만 영구 저장합니다.

- Google Place ID
- 사용자가 확인해 저장한 이름·카테고리·지역 태그·메모
- 29일 이하로 사용하는 좌표 캐시

화면 우측 상단 **백업** 버튼으로 JSON을 내려받을 수 있습니다. 전체 복구용 백업은 컨테이너를 잠시 멈춘 뒤 `data` 폴더를 Hyper Backup 대상에 포함하는 방식이 가장 안전합니다.

```bash
docker compose stop
cp data/joy-map.db data/joy-map-backup.db
docker compose start
```

업데이트 전에도 같은 방식으로 백업하세요.

## 운영 명령

```bash
# 상태와 로그
docker compose ps
docker compose logs --tail=100

# 코드 업데이트 후 다시 빌드
docker compose up -d --build

# 중지
docker compose down
```

`docker compose down`은 `data` 폴더를 삭제하지 않습니다.

## GitHub 푸시 자동 배포

이 프로젝트는 문법 사이트와 같은 배포 흐름을 사용합니다. `main` 브랜치에 푸시되면 `.github/workflows/deploy-synology.yml`이 NAS에 SSH로 접속하고, `/volume1/docker/joy-map/scripts/synology-auto-deploy.sh`를 실행합니다. 배포 스크립트는 최신 커밋만 fast-forward로 받은 뒤 이미지를 다시 만들고 `http://127.0.0.1:7330/api/health`가 정상인지 확인합니다.

### 최초 한 번: GitHub 저장소 설정

1. GitHub에 `joy-map` 저장소를 만듭니다. 공개 저장소로 두어도 `.env`와 SQLite 데이터는 커밋되지 않지만, 개인 프로젝트라면 비공개 저장소를 권장합니다.
2. 로컬 프로젝트의 `origin`을 해당 저장소로 지정하고 `main`을 푸시합니다.
3. 저장소의 **Settings → Secrets and variables → Actions**에 문법 사이트와 동일한 NAS 접속값을 다음 이름으로 등록합니다.
   - `NAS_HOST`
   - `NAS_PORT`
   - `NAS_USER`
   - `NAS_SSH_KEY`
   - `NAS_KNOWN_HOSTS`

GitHub는 기존 저장소의 비밀값을 다시 보여 주지 않으므로, 문법 사이트에 넣었던 원본 값을 새 저장소에도 한 번 등록해야 합니다.

### 최초 한 번: NAS 체크아웃 설정

NAS에서 배포용 Git 자격 증명을 준비한 다음 아래처럼 프로젝트를 배치합니다. 비공개 저장소라면 읽기 전용 deploy key 또는 접근 토큰을 사용합니다.

```bash
sudo mkdir -p /volume1/docker/joy-map
sudo chown -R "$USER" /volume1/docker/joy-map
git clone <JOY_MAP_GIT_URL> /volume1/docker/joy-map
cd /volume1/docker/joy-map
cp .env.example .env
mkdir -p data
chmod 700 data
```

`.env`의 로그인 비밀번호, 세션 키, Google Maps 키와 Map ID를 입력한 뒤 최초 한 번 실행합니다.

Synology의 `vi` 편집기가 익숙하지 않다면 다음 대화형 도구를 사용합니다. 입력한 API 키와 비밀번호는 화면에 표시되지 않으며, 기존 `.env`는 권한이 제한된 백업 파일로 보관됩니다.

```sh
cd /volume1/docker/joy-map
sh scripts/configure-secrets.sh
```

```bash
docker compose up -d --build
curl -fsS http://127.0.0.1:7330/api/health
```

GitHub Actions용 NAS 계정은 비밀번호 없이 해당 배포 스크립트만 `sudo`로 실행할 수 있도록 허용해야 합니다. 문법 사이트에서 쓰는 제한 규칙에 다음 경로를 추가하면 됩니다.

```text
/bin/sh /volume1/docker/joy-map/scripts/synology-auto-deploy.sh
```

이 1회 설정 후에는 변경 요청 뒤 **“커밋 푸시해줘”**라고 하면 `main` 푸시와 NAS 자동 배포까지 이어집니다. GitHub Actions의 **Deploy to Synology NAS** 실행 결과가 최종 배포 기록입니다.

## 문서

- [지도 API 비교](docs/MAP-API-COMPARISON.md)
- [구조와 데이터 설계](docs/ARCHITECTURE.md)
