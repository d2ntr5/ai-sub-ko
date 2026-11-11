.PHONY: test dist store publish clean

# 테스트 (node --test)
test:
	node --test

# 올리지 않고 build/ai-sub-ko-<버전>.zip 까지 (크롬 웹 스토어에 올릴 파일): make dist VERSION=1.0.0
dist:
	bash scripts/release.sh $(VERSION) --no-publish

# 크롬 웹 스토어에 올릴 zip (manifest 가 맨 위): build/ai-sub-ko-<버전>-store.zip
store:
	bash scripts/package.sh

# 이 저장소의 GitHub Release v<버전> 만들기 — 사용자가 지시할 때만
publish:
	bash scripts/release.sh $(VERSION)

clean:
	rm -rf build
