# 지도 API 비교 및 선택 근거

확인 기준일: **2026-09-21**. 무료 한도와 약관은 바뀔 수 있으므로 실제 배포 직전에 각 콘솔에서 다시 확인하세요.

| 항목 | Google Maps Platform | NAVER Maps | Kakao Map |
|---|---|---|---|
| 전 세계 장소·지도 | 가장 강함 | 한국 중심 | 한국 중심 |
| 웹 동적 지도 무료량 | Dynamic Maps 월 10,000회 | 대표 계정 월 6,000,000회 | 첫 활성화 앱 일 300,000회, 전체 무료 월 한도 적용 |
| 장소 검색 | Places Text Search 지원. 일반 표시 필드를 쓰는 Pro 구간은 월 5,000회 무료 | 별도 NAVER 검색 API 지역 검색 사용 가능. 일 25,000회지만 요청당 최대 5개 | 키워드/카테고리 장소 검색 지원, 첫 활성화 앱 일 100,000회 |
| 주소/좌표 | 전 세계 지오코딩. Essentials 월 10,000회 무료 | Geocoding 월 3,000,000회(대표 계정) | 주소·좌표·행정구역 변환 일 100,000회(첫 활성화 앱) |
| 결제 설정 | 결제 계정 필수 | 무료 대표 계정 외 과금 주의 | 2026-07-21 이후 첫 활성화 앱만 무료, 초과 사용은 비즈월렛 필요 |
| 저장 정책 관점 | Place ID는 장기 저장 가능. 기타 Places 콘텐츠 저장·캐시는 제한적 | 각 Maps·검색 API 약관을 함께 확인해야 함 | 앱/쿼터 정책 확인 필요 |
| 이 앱과의 적합성 | **전 세계 범위라면 최적** | 국내 전용·네이버 검색 선호 시 유리 | 국내 전용이고 단일 API 구성을 원할 때 유리 |

## 결론

전 세계 도시의 맛집과 명소를 한 지도에서 검색하려는 현재 요구에는 Google Maps Platform을 권장합니다. 개인용 호출량은 무료 구간보다 훨씬 작을 가능성이 높습니다. 대신 결제 계정과 API 키 제한은 필수이고, Google Places 콘텐츠 저장 제한 때문에 이 앱은 Place ID와 사용자 작성 데이터만 영구 보관합니다. 지도 마커 좌표는 29일 캐시 후 자동 갱신합니다.

단, Google Maps Platform 공식 지원표에서 대한민국의 자동차 길찾기는 지원되지 않습니다. JOY MAP은 지도·장소 검색과 해외 경로에는 Google을 유지하고, 국내 자동차 경로만 카카오내비 길찾기 REST API를 사용하는 혼합 구성을 적용합니다.

## 공식 문서

### Google

- [Google Maps Platform 가격표](https://developers.google.com/maps/billing-and-pricing/pricing)
- [Maps JavaScript API 사용량 및 결제](https://developers.google.com/maps/documentation/javascript/usage-and-billing)
- [Text Search (New), Maps JavaScript API](https://developers.google.com/maps/documentation/javascript/place-search)
- [Place Details와 fetchFields](https://developers.google.com/maps/documentation/javascript/place-details)
- [Place ID 저장 안내](https://developers.google.com/maps/documentation/places/web-service/place-id)
- [Places API 정책과 캐시 제한](https://developers.google.com/maps/documentation/places/web-service/policies)
- [비용·쿼터 관리](https://developers.google.com/maps/billing-and-pricing/manage-costs)
- [국가별 기능 지원 범위](https://developers.google.com/maps/coverage)

### NAVER

- [NAVER Cloud Maps 요금](https://www.ncloud.com/charge/price/ko)
- [Maps 개요와 대표 계정 정책](https://guide.ncloud-docs.com/docs/maps-overview)
- [지역 검색 API](https://developers.naver.com/docs/serviceapi/search/local/local.md)
- [NAVER 검색 API 호출 한도](https://developers.naver.com/products/intro/plan/plan.md)

### Kakao

- [Kakao Map 이해하기·2026 정책](https://developers.kakao.com/docs/ko/kakaomap/common)
- [Kakao 무료 쿼터와 추가 사용 단가](https://developers.kakao.com/docs/ko/getting-started/quota)
- [Kakao Map REST API](https://developers.kakao.com/docs/ko/kakaomap/rest-api)
- [카카오내비 자동차 길찾기](https://developers.kakaomobility.com/guide/navi-api/directions)
