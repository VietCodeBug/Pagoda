# Kết quả kiểm tra bản local

Ngày 04/11/2026. Node.js 22.20.0 trên Windows. Các lượt đầu dùng SwiftShader để kiểm tra chức năng; lượt kiểm tra chuyển động mới dùng Chrome với GPU. Không dùng giả lập viewport để kết luận hiệu năng trên điện thoại thật.

| Kiểm tra | Kết quả |
| --- | --- |
| `pnpm typecheck` | Đạt |
| `pnpm cf:typecheck` | Đạt |
| `pnpm test` | 91/91 đạt: phòng/presence, định danh tab, đường đi, storage/range, public Realtime, env, PostgreSQL, output Netlify, hoạt động, clip đấm và phần thưởng |
| `pnpm build` | Đạt; game, guest/prayer API, asset route và capability route được build |
| `pnpm smoke` | Đạt với Next local, Neon thật và hai WebSocket client |
| Wrangler `deploy --dry-run` | Đạt; không deploy |
| Wrangler local, cổng 1998 | `/health` và room route thật hoạt động; hai client chat/di chuyển/giao đấu đạt |
| GLB Validator | 4 model gốc tối ưu và 4 model cảnh CC0 mới: không có lỗi |
| Chrome trên build production cổng 3001 | 8 nhóm kiểm tra UI đạt, không có lỗi trình duyệt |
| `pnpm smoke:neon` | Hai subscription Neon thật nhận insert/delete; private bị loại; S3 checksum và audio Range đạt |
| Browser Live SQL trên cổng 3001 | Kết nối trực tiếp báo live, public xuất hiện/xóa tự động, private không xuất hiện |
| `pnpm test:activities` | Bắt cá thực, đồng bộ hai tab, lưu/reload Neon, chống replay và khác hồ sơ; không có lỗi trang |
| `pnpm test:presence` | Hai tab cùng cookie/sessionStorage, đóng/mở lại, ba lần reload, đổi phòng và spawn tách nhau; 212 snapshot, tối đa hai avatar QA, không lỗi trang |

## Chrome production

Viewport desktop 1440×1000, mobile giả lập 390×844. Hai phiên độc lập cùng kết nối server phòng local cổng 1999.

1. Tải cảnh, model, chọn ngoại hình và vào phòng bằng tên khách.
2. Xác nhận vị trí thực sự đổi khi giữ W; đổi hướng W/S/A/D liên tục không mất ổn định vật lý.
3. Ngồi thiền chặn di chuyển; E đứng dậy.
4. M mở bản đồ; Enter gửi chat qua server và nhận tin trả về.
5. Chuyển đèn ngày/đêm.
6. Chạy vào chính điện, E mở lời nguyện, lưu lời nguyện riêng tư vào Neon và thực hiện nghi lễ.
7. Mobile không tràn ngang; joystick thực sự thay đổi tọa độ nhân vật.
8. Hai phiên có mặt cùng phòng, số người đồng bộ đúng.

Ảnh trong `artifacts/`: `desktop-entry.png`, `desktop-game.png`, `desktop-night.png`, `map.png`, `incense.png`, `mobile-entry.png`, `mobile-game.png`. Kết quả máy đọc được ở `artifacts/ui-results.json`.

Đã xem ảnh để sửa hai lỗi mà kiểm tra kiểu dữ liệu không phát hiện: capsule nghiêng khi va chạm/chạy và tên bone bị GLTFLoader bỏ dấu `:`. Nhân vật hiện khóa xoay X/Z, giữ xoay Y; pose dựa trên bone đã tải đúng tên. Cần giữ thông số xoay mặc định của Ecctrl, tránh damping quá lớn gây vận tốc góc không hữu hạn.

Bản hình ảnh tiếp theo có bầu trời HDRI có mây 2K, ánh sáng môi trường, mặt đất PBR, model đá/cây quét 3D và cỏ instanced lay theo gió. Asset mới nằm trong `docs/SCENE_ASSETS.md`; dữ liệu asset trên S3 đã tải lại đối chiếu checksum. Ảnh `scene-upgrade-entry.png` và `neon-live-journal.png` ghi lại bản mới. Data API URL đã probe: yêu cầu JWT; Auth vẫn không được bật, SQL/Realtime tiếp tục hoạt động.

## API và dữ liệu

Đã thử tạo/sửa/tải lại hồ sơ, cookie bị sửa/hết hạn, origin khác, avatar/tên không hợp lệ, lời nguyện public/private và hai request gửi đồng thời. Lời nguyện riêng không xuất hiện trên API công khai; cooldown 30 giây áp dụng giữa nhiều request.

Migration giữ dữ liệu hiện có và bổ sung bảng/view/index trong namespace `vto_*`, gồm tiến trình trò chơi ở migration 0003. Dữ liệu QA được dọn theo đúng UUID đã tạo; giữ nguyên dữ liệu khác.

## Chuẩn bị Netlify

`pnpm env:netlify` đã tạo `.env.netlify` với 12 biến có giá trị; các dòng URL cũ được đặt tên, PostgreSQL bỏ dấu chấm phẩy cuối, storage dùng `NEON_STORAGE_*` để tránh biến AWS dành riêng. `pnpm env:check --file .env.netlify` đạt kiểm tra offline. Chạy lại lệnh export giữ nguyên session secret và Worker URL đã cấu hình; không in credential.

Lượt chuẩn bị env ban đầu đã qua `pnpm build`, TypeScript web/Worker và 34 bài kiểm tra. Dùng chính `.env.netlify` để kết nối PostgreSQL `SELECT 1`, S3 HEAD xác nhận kích thước avatar và Neon Realtime báo live. Phép thử S3 cố ý gán AWS credential/region giả của nền tảng; cấu hình Neon có tên riêng vẫn được ưu tiên. Build production local nạp file import đã qua API smoke và hai client WebSocket; dữ liệu QA được dọn. Quét bundle client không tìm thấy credential local.

Ở lượt chuẩn bị env ban đầu chưa có Worker public; việc triển khai và kiểm tra Worker đã được cập nhật trong mục online mặc định bên dưới. Data API chưa có JWT nên tiếp tục dùng PostgreSQL. Auth/JWKS chỉ lưu URL tham khảo, không kích hoạt đăng nhập.

## Sửa pipeline Netlify và migration sau PR #1

`pnpm check` đạt TypeScript web/Worker và 45 tests trong 8 file. PGlite thực thi PostgreSQL thật trong bộ nhớ: tạo mới, nâng cấp baseline cũ, sửa database do PR #1 tạo và chạy lại migration đều giữ dữ liệu, phục hồi CHECK/FK đúng, bảo vệ lời riêng khỏi role anonymous. Dữ liệu cũ không hợp lệ khiến bước repair rollback, không bị sửa/xóa. Drizzle metadata check đạt; snapshot mới nhất so với schema không sinh DDL. Kiểm tra chỉ đọc trên Neon xác nhận hai CHECK hiện tại đã validated; không áp dụng migration production.

`netlify.toml` khai báo adapter không ghim phiên bản, tiếp theo là plugin kiểm tra output. Netlify CLI 27.16.2 / Build 37.7.3 / Next.js Runtime 5.16.6 đã hoàn thành build local, đóng gói `___netlify-server-handler` và báo `Verified Netlify Next.js output: catch-all API function, client bundles and game assets.` Các test riêng chặn đúng layout `.next` thô từng gây 404.

Phép build Netlify được chạy trong bản sao dưới `.wrangler/netlify-validation`. Windows tại máy thử không có quyền tạo POSIX symlink; bản build chuẩn báo EPERM ở bước copy của adapter. Công cụ thử nghiệm chỉ trong `.wrangler` thay copy symlink của handler bằng copy file/junction để chạy tiếp các bước adapter và bundler; code adapter, app và cấu hình gửi Git không bị patch. Đây là bằng chứng kiểm tra artifact/lifecycle trên Windows, không phải kiểm tra runtime Netlify Linux hay số đo dung lượng bundle Linux. Không publish lên host trong lượt sửa này.

## Online mặc định và sân bị biến mất khi xoay camera

Worker `virtual-temple-realtime.phamvietanh19218.workers.dev` đã được người dùng deploy. Kiểm tra public với Origin Netlify thật: health 200/capacity20, hai kết nối có ID riêng, nhận đủ hai người, chat và movement cập nhật qua lại. Test dùng phòng QA riêng, đóng kết nối sau kiểm tra, không tạo hồ sơ Neon.

`pnpm test:tabs` đã qua trên Chrome với hai tab cùng BrowserContext/cookie: cùng hồ sơ khách, hai ID kết nối riêng, cả hai thấy avatar/số người, chat A nhận tại B và di chuyển WASD A xuất hiện trong snapshot B. Không có lỗi trang; đúng một hồ sơ QA và lời nguyện liên quan được dọn theo UUID. Production dùng Worker mặc định qua config API no-store; `REALTIME_URL` cho phép override runtime, alias cũ được giữ. Không báo online trước gói welcome.

Courtyard và roof InstancedMesh đã tính lại boundingBox/boundingSphere sau khi cập nhật ma trận. Tái hiện bằng Three.js cho sân lát đá tại 24 góc: bounds cũ cull sai 21 góc, bounds mới không cull sai góc nào. Bốn ảnh orbit mobile được kiểm tra, không mất sàn hoặc lỗi trình duyệt (`artifacts/ground-orbit-0.png` đến `-3.png`). Không đổi độ cao/collision/texture hoặc giảm chất lượng cảnh để che lỗi.

## Hoạt động, animation đấm và tượng ngoài vườn

Engine có 14 kiểm tra cho 7 minigame mới, bên cạnh PvP sẵn có. 8 kiểm tra HMAC/PostgreSQL thực thi claim CTE, replay, nhận trùng đồng thời, kỷ lục nhỏ nhất/lớn nhất, quyền đọc và rollback nguyên tử. Hai test clip GLB kiểm tra bone binding, jab/cross và chân không trượt. TypeScript web/Worker, 74 tests và metadata Drizzle đều đạt.

Browser smoke thực sự đi đến hồ, thả câu/giật cá trong cửa sổ server, xác nhận tab khác thấy tư thế/effect, lưu cá/xu/XP vào Neon, gửi lại receipt không cộng thêm, gửi bằng hồ sơ khác nhận 403 và reload vẫn còn bộ sưu tập. Không có page error. Hai hồ sơ QA cùng claims/fish/scores/wallet/prayers liên quan được dọn đúng UUID. Bằng chứng: `artifacts/activities-results.json`, `activities-fishing-online.png`, `activities-saved-collection.png`.

Probe riêng qua Worker public dùng ticket phiên khách thật: đi đến bờ hồ qua giao thức movement, server chọn cá và ký receipt, API Neon nhận thưởng một lần và từ chối replay. Migration 0003 đã áp dụng, Worker đã deploy phiên bản `b4981688-ba39-4bc9-b72a-c92b57b334cb`, asset S3 23 file được xác minh. Các API `/api/game/session`, `/api/game/progress`, `/api/game/claim` đã qua build/đóng gói Netlify và guard output; vẫn dùng công cụ copy symlink Windows đã mô tả ở trên.

Tượng garden giảm 93,59% đỉnh, 96% tam giác, còn 2,14 MB; bản gốc giữ nguyên. Ảnh so sánh front/side và đi bộ đến vườn đã kiểm tra, không có lỗi trang. Clip đấm mới GLB 0 lỗi/0 cảnh báo, tượng 0 lỗi/1 tangent warning. Các ảnh trong `artifacts/punch-*.png`, `garden-statue-*.png` và `activities-*.png`.

## Dọn avatar khi thoát và vào lại

Server xóa session trước khi dọn hoạt động có broadcast, cô lập lỗi gửi/đóng socket và thu hồi transport lỗi ở tick tiếp theo. Gói `leave` xóa avatar ngay khi nhận được; heartbeat 10 giây và lease 60 giây xử lý kết nối treo không phát sự kiện close. Dừng timer cả khi phòng rỗng do leave hoặc lease, không chỉ do transport close. Bản local kiểm tra đúng instance phòng trước khi close muộn xóa room khỏi Map.

Client gửi leave trong cleanup/pagehide, dừng retry/fetch khi rời trang và kết nối lại khi quay về từ BFCache. Mỗi tab có UUID riêng, dùng BroadcastChannel để phát hiện sessionStorage bị nhân bản; chỉ profile đã xác thực bằng ticket cùng UUID tab mới được thay socket cũ. Không gộp người chơi theo tên hoặc cookie. Phòng đầy thử lại sau 15 giây để có thể vào sau khi chỗ treo được thu hồi. Điểm spawn chọn vị trí trống thay vì dựa vào số người còn lại.

10 regression test server kiểm tra lỗi gửi trong lúc dọn hoạt động, close ném lỗi, leave/lệnh đến muộn, lease, pings khi ngồi yên, packet lỗi, socket chưa join, thay phiên, khác tab/hồ sơ, ticket giả, xác thực hoàn tất sau khi rời và spawn 20 người riêng vị trí. 7 test định danh tab kiểm tra reload, tab nhân bản, probe đồng thời, BFCache và storage bị chặn. Tổng TypeScript web/Worker và 91 tests đạt. Chrome thật giữ một observer, đóng/mở lại actor, reload ba lần và đổi phòng hai lần; không tích lũy ID cũ, hai avatar cuối cách nhau trên 1 m. Dữ liệu QA Neon được dọn theo UUID/tên/thời điểm tạo; bằng chứng ở `artifacts/presence-results.json` và `presence-game.png`.

Worker đã deploy phiên bản `79cb8a7c-508d-4afa-ad3c-9044210fe2be`. Probe public với Origin Netlify xác nhận leave xóa ngay, reconnect cùng tab thay socket cũ bằng close 4005, observer cùng profile vẫn ở lại; socket im lặng hết lease 60 giây bị đóng 4002 trong khi observer trả heartbeat tiếp tục kết nối. Probe dùng ticket QA ký tạm, không tạo bản ghi database. Build Netlify cuối hoàn tất adapter/function/guard như quy trình Windows đã mô tả ở trên. Bản web cần push và Netlify deploy lại để nhận lifecycle/định danh tab mới.

## Phạm vi còn cần đo riêng

Chưa xác nhận bản web mới trên production sau khi người dùng push/deploy; Worker public đã được kiểm tra độc lập. Chưa benchmark 20 thiết bị cùng lúc, chưa đo FPS/nhiệt/bộ nhớ trên điện thoại thật. Bài kiểm tra 20 chỗ và từ chối người thứ 21 xác nhận luật phòng, không phải benchmark hiệu năng render. Camera và collision dùng hình đơn giản gần với kiến trúc; clip nghi lễ hiện là pose runtime. Better Auth/account-link, moderation và phục hồi room sau deploy nằm trong roadmap.

## Sửa rung khi di chuyển

Camera theo vị trí được Rapier nội suy để render thay vì tọa độ vật lý thô; phím/khóa nghi lễ chạy trước bước vật lý, camera chạy sau đó và trước Html/render. Camera chỉ làm dịu góc/zoom, không kéo chậm riêng vị trí bám nhân vật. Avatar từ xa chỉ gán vị trí ban đầu một lần, sau đó nội suy giữa các snapshot thay vì bị React đặt lại vị trí mỗi gói 10 Hz.

Cây dùng LOD theo khoảng cách, bóng cây chi tiết dành cho High, số cỏ giảm theo preset. Khi khung hình chậm, renderer hạ DPR có giới hạn và hysteresis; giữ sky/texture và không đổi lựa chọn preset của người chơi. Memo cảnh tránh dựng lại cả thế giới mỗi lần điều chỉnh DPR.

Đo chạy thẳng 5 giây ở 960×640, Medium, Chrome GPU: 295 frame; median 16,7 ms, p95 16,8 ms; không có frame trên 50 ms. Độ lệch bước nameplate tối đa 0,031 pixel trong phép đo. Đây là một cảnh/thiết bị kiểm tra, không phải cam kết 60 FPS ở mọi máy/tải. Dữ liệu: `artifacts/movement-native.json`.
