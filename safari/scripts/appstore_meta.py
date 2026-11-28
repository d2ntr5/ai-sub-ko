"""App Store 버전 정보 넣기 (Safari판 · 맥). 값은 safari/appstore/metadata.md 한 곳에서 읽는다. 같은 값을 다시 넣어도 됨.
Karya scripts/appstore_meta.py 에서 가져옴.

    uv run -q --no-project --with 'pyjwt[crypto]' python3 safari/scripts/appstore_meta.py <버전> [--build]

연락처(이름 · 이메일 · 전화)와 앱 개인정보(데이터 수집 표)는 API 가 없거나 넣지 않는다: 총괄이 웹에서.
"""
import hashlib, json, os, re, sys, time, urllib.request
sys.path.insert(0, os.path.dirname(__file__))
from asc import call

BUNDLE = "io.github.d2ntr5.ai-sub-ko"
HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))  # safari/
IOS = False
PLATFORM = "MAC_OS"
_DIR = os.path.join(HERE, "appstore/screenshots")
SETS = {"APP_DESKTOP": [os.path.join(_DIR, f) for f in ("1-start.png", "2-engine.png", "3-consent.png", "4-help.png")]}

_MD = open(os.path.join(HERE, "appstore/metadata.md"), encoding="utf-8").read()
def _block(title):
    m = re.search(r"## " + re.escape(title) + r".*?```\n(.*?)```", _MD, re.S)
    return m.group(1).strip()
def _line(prefix):
    m = re.search(r"^- " + re.escape(prefix) + r": `([^`]*)`", _MD, re.M)
    return m.group(1)

DESCRIPTION = _block("설명")
NOTES = _block("심사 메모")
KEYWORDS = re.search(r"## 키워드\n`([^`]*)`", _MD).group(1)
SUBTITLE = _line("부제")
SUPPORT = "https://github.com/d2ntr5/ai-sub-ko/issues"
MARKETING = "https://github.com/d2ntr5/ai-sub-ko"
PRIVACY = "https://github.com/d2ntr5/ai-sub-ko/blob/main/PRIVACY.md"
COPYRIGHT = "2026 d2ntr5"
IOS_DESCRIPTION = IOS_NOTES = None


def app_id():
    st, body = call("GET", f"/v1/apps?filter[bundleId]={BUNDLE}")
    if st >= 400 or not body.get("data"):
        print("앱 레코드가 아직 없습니다 (App Store Connect 웹에서 총괄이 만듦)."); sys.exit(3)
    return body["data"][0]["id"]


def ok(res, what):
    status, body = res
    if status >= 400:
        print(f"실패: {what} HTTP {status} {json.dumps(body.get('errors', body), ensure_ascii=False)[:600]}")
        sys.exit(1)
    print(f"{what}: 됨")
    return body


def _unused_check_shared():
    """iOS: 앱 레코드 하나라 맥에서 넣은 값을 다시 넣지 않고 확인만 한다."""
    info = next(x for x in ok(call("GET", f"/v1/apps/{APP}/appInfos"), "앱 정보 찾기")["data"]
                if x["attributes"].get("state") != "READY_FOR_DISTRIBUTION")
    il = [x["attributes"] for x in ok(call("GET", f"/v1/appInfos/{info['id']}/appInfoLocalizations"), "앱 정보 현지화")["data"]]
    print("  개인정보 URL:", [x.get("privacyPolicyUrl") for x in il])
    cat = call("GET", f"/v1/appInfos/{info['id']}/primaryCategory")[1].get("data") or {}
    print("  분류:", cat.get("id"))
    app = ok(call("GET", f"/v1/apps/{APP}?fields[apps]=contentRightsDeclaration"), "앱")["data"]["attributes"]
    print("  제3자 콘텐츠:", app.get("contentRightsDeclaration"))
    st, av = call("GET", f"/v2/appAvailabilities/{APP}/territoryAvailabilities?limit=200&include=territory")
    if st < 400:
        on = [t["relationships"]["territory"]["data"]["id"] for t in av["data"] if t["attributes"].get("available")]
        print(f"  판매 국가(available): {on} / {len(av['data'])}")
    else:
        print("  판매 국가: 읽기 실패", st)
    st, ps = call("GET", f"/v1/appPriceSchedules/{APP}/manualPrices?include=appPricePoint&fields[appPricePoints]=customerPrice")
    print("  가격:", [p["attributes"].get("customerPrice") for p in ps.get("included", [])] if st < 400 else f"읽기 실패 {st}")


def main():
    global APP
    APP = app_id()
    version = sys.argv[1]
    attach = "--build" in sys.argv
    vers = ok(call("GET", f"/v1/apps/{APP}/appStoreVersions?filter[platform]={PLATFORM}"), f"{PLATFORM} 버전 찾기")["data"]
    v = next(x for x in vers if x["attributes"]["appStoreState"] in ("PREPARE_FOR_SUBMISSION", "DEVELOPER_REJECTED", "REJECTED", "METADATA_REJECTED"))
    vid = v["id"]
    ok(call("PATCH", f"/v1/appStoreVersions/{vid}", {"data": {"type": "appStoreVersions", "id": vid,
        "attributes": {"versionString": version, "copyright": COPYRIGHT}}}), f"버전 문자열 {version} · 저작권")

    locs = ok(call("GET", f"/v1/appStoreVersions/{vid}/appStoreVersionLocalizations"), "설명 찾기")["data"]
    loc = next(x for x in locs if x["attributes"]["locale"] == "ko")
    ok(call("PATCH", f"/v1/appStoreVersionLocalizations/{loc['id']}", {"data": {"type": "appStoreVersionLocalizations", "id": loc["id"],
        "attributes": {"description": DESCRIPTION, "keywords": KEYWORDS, "supportUrl": SUPPORT, "marketingUrl": MARKETING}}}), "설명 · 키워드 · 지원 · 마케팅 URL")

    if IOS:
        check_shared()
    else:
        info = next(x for x in ok(call("GET", f"/v1/apps/{APP}/appInfos"), "앱 정보 찾기")["data"]
                    if x["attributes"].get("state") != "READY_FOR_DISTRIBUTION")
        il = next(x for x in ok(call("GET", f"/v1/appInfos/{info['id']}/appInfoLocalizations"), "앱 정보 현지화")["data"] if x["attributes"]["locale"] == "ko")
        ok(call("PATCH", f"/v1/appInfoLocalizations/{il['id']}", {"data": {"type": "appInfoLocalizations", "id": il["id"],
            "attributes": {"privacyPolicyUrl": PRIVACY, "subtitle": SUBTITLE}}}), "개인정보 처리방침 URL · 부제")
        ok(call("PATCH", f"/v1/appInfos/{info['id']}", {"data": {"type": "appInfos", "id": info["id"],
            "relationships": {"primaryCategory": {"data": {"type": "appCategories", "id": "PRODUCTIVITY"}}}}}), "분류: 생산성")
        ok(call("PATCH", f"/v1/apps/{APP}", {"data": {"type": "apps", "id": APP,
            "attributes": {"contentRightsDeclaration": "DOES_NOT_USE_THIRD_PARTY_CONTENT"}}}), "제3자 콘텐츠: 없음")

        # 가격: 무료(대한민국 기준).
        points = ok(call("GET", f"/v1/apps/{APP}/appPricePoints?filter[territory]=KOR&limit=5&fields[appPricePoints]=customerPrice"), "가격 찾기")["data"]
        free = next(p for p in points if float(p["attributes"]["customerPrice"]) == 0)
        ok(call("POST", "/v1/appPriceSchedules", {"data": {"type": "appPriceSchedules",
            "relationships": {"app": {"data": {"type": "apps", "id": APP}},
                              "baseTerritory": {"data": {"type": "territories", "id": "KOR"}},
                              "manualPrices": {"data": [{"type": "appPrices", "id": "${free}"}]}}},
            "included": [{"type": "appPrices", "id": "${free}", "attributes": {"startDate": None},
                          "relationships": {"appPricePoint": {"data": {"type": "appPricePoints", "id": free["id"]}}}}]}), "가격: 무료")

        # 판매 국가: 대한민국만.
        # 모든 국가를 넣어야 함(빠진 국가는 409): 대한민국만 available.
        codes = [t["id"] for t in ok(call("GET", "/v1/territories?limit=200"), "국가 목록")["data"]]
        status, body = call("POST", "/v2/appAvailabilities", {"data": {"type": "appAvailabilities",
            "attributes": {"availableInNewTerritories": False},
            "relationships": {"app": {"data": {"type": "apps", "id": APP}},
                              "territoryAvailabilities": {"data": [{"type": "territoryAvailabilities", "id": f"${{{c}}}"} for c in codes]}}},
            "included": [{"type": "territoryAvailabilities", "id": f"${{{c}}}", "attributes": {"available": c == "KOR"},
                          "relationships": {"territory": {"data": {"type": "territories", "id": c}}}} for c in codes]})
        if status == 409:
            print("판매 국가: 이미 있음(웹에서 확인)", json.dumps(body.get("errors"), ensure_ascii=False)[:300])
        else:
            ok((status, body), "판매 국가: 대한민국만")

    # 연령 등급: 모든 항목 없음 (2026-11-29 이 목록으로 넣어 됨. 덮어쓰기 필드는 건드리지 않음)
    st, ar = call("GET", f"/v1/appInfos/{info['id']}/ageRatingDeclaration")
    if st < 400 and ar.get("data"):
        levels = ["alcoholTobaccoOrDrugUseOrReferences", "contests", "gamblingSimulated", "gunsOrOtherWeapons", "medicalOrTreatmentInformation",
                  "profanityOrCrudeHumor", "sexualContentGraphicAndNudity", "sexualContentOrNudity", "horrorOrFearThemes", "matureOrSuggestiveThemes",
                  "violenceCartoonOrFantasy", "violenceRealisticProlongedGraphicOrSadistic", "violenceRealistic"]
        flags = ["advertising", "gambling", "lootBox", "messagingAndChat", "parentalControls", "ageAssurance", "unrestrictedWebAccess",
                 "userGeneratedContent", "healthOrWellnessTopics", "datingAndRelationships", "sharedLocation", "socialMedia", "socialMediaAgeRestricted"]
        attrs = {**{k: "NONE" for k in levels}, **{k: False for k in flags}}
        s2, b2 = call("PATCH", f"/v1/ageRatingDeclarations/{ar['data']['id']}", {"data": {"type": "ageRatingDeclarations", "id": ar["data"]["id"], "attributes": attrs}})
        print("연령 등급: 됨" if s2 < 400 else f"연령 등급: 실패 {s2} {json.dumps(b2.get('errors'), ensure_ascii=False)[:300]} (웹에서)")

    # 심사 메모(연락처는 총괄이 웹에서).
    st, rd = call("GET", f"/v1/appStoreVersions/{vid}/appStoreReviewDetail")
    attrs = {"notes": IOS_NOTES if IOS else NOTES, "demoAccountRequired": False}
    if rd.get("data"):
        rid = rd["data"]["id"]
        ok(call("PATCH", f"/v1/appStoreReviewDetails/{rid}", {"data": {"type": "appStoreReviewDetails", "id": rid, "attributes": attrs}}), "심사 메모")
    else:
        ok(call("POST", "/v1/appStoreReviewDetails", {"data": {"type": "appStoreReviewDetails", "attributes": attrs,
            "relationships": {"appStoreVersion": {"data": {"type": "appStoreVersions", "id": vid}}}}}), "심사 메모")

    # 스크린샷: 세트마다 비우고 다시 올림.
    sets = ok(call("GET", f"/v1/appStoreVersionLocalizations/{loc['id']}/appScreenshotSets"), "스크린샷 세트 찾기")["data"]
    for kind, paths in SETS.items():
        if not paths:
            print(f"스크린샷 없음: {kind}"); sys.exit(1)
        desk = next((x for x in sets if x["attributes"]["screenshotDisplayType"] == kind), None)
        if desk is None:
            desk = ok(call("POST", "/v1/appScreenshotSets", {"data": {"type": "appScreenshotSets", "attributes": {"screenshotDisplayType": kind},
                "relationships": {"appStoreVersionLocalization": {"data": {"type": "appStoreVersionLocalizations", "id": loc["id"]}}}}}), f"스크린샷 세트 {kind}")["data"]
        for old in ok(call("GET", f"/v1/appScreenshotSets/{desk['id']}/appScreenshots"), f"옛 스크린샷 {kind}")["data"]:
            ok(call("DELETE", f"/v1/appScreenshots/{old['id']}"), "옛 스크린샷 지움")
        for path in paths:
            data = open(path, "rb").read()
            shot = ok(call("POST", "/v1/appScreenshots", {"data": {"type": "appScreenshots",
                "attributes": {"fileName": os.path.basename(path), "fileSize": len(data)},
                "relationships": {"appScreenshotSet": {"data": {"type": "appScreenshotSets", "id": desk["id"]}}}}}), f"자리 {os.path.basename(path)}")["data"]
            for op in shot["attributes"]["uploadOperations"]:
                part = data[op["offset"]: op["offset"] + op["length"]]
                req = urllib.request.Request(op["url"], data=part, method=op["method"],
                                             headers={h["name"]: h["value"] for h in op["requestHeaders"]})
                urllib.request.urlopen(req, timeout=120).read()
            ok(call("PATCH", f"/v1/appScreenshots/{shot['id']}", {"data": {"type": "appScreenshots", "id": shot["id"],
                "attributes": {"uploaded": True, "sourceFileChecksum": hashlib.md5(data).hexdigest()}}}), f"올림 {os.path.basename(path)}")

    if attach:
        builds = ok(call("GET", f"/v1/builds?filter[app]={APP}&filter[preReleaseVersion.platform]={PLATFORM}"
                             f"&filter[preReleaseVersion.version]={version}&sort=-uploadedDate&fields[builds]=version,processingState"), "빌드 찾기")["data"]
        valid = [b for b in builds if b["attributes"]["processingState"] == "VALID"]
        if not valid:
            print("빌드: 아직 처리 중", [b["attributes"] for b in builds]); sys.exit(2)
        b = valid[0]
        ok(call("PATCH", f"/v1/appStoreVersions/{vid}/relationships/build", {"data": {"type": "builds", "id": b["id"]}}), f"빌드 {b['attributes']['version']} 붙임")


if __name__ == "__main__":
    main()
