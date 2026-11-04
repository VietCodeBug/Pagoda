# An Nhiên · Virtual Temple Online

Game chùa 3D trên trình duyệt, với bản chơi local và bộ thiết kế để tiếp tục phát triển theo module. Mở web là vào không gian game; chọn tên khách rồi khám phá.

## Chạy ngay

Yêu cầu Node.js 22+, pnpm 12 và trình duyệt có WebGL2.

```powershell
pnpm install --frozen-lockfile
pnpm dev
```

Mở **http://localhost:3000**. Lệnh `dev` chạy cả Next.js và server phòng WebSocket cổng 1999. Mở thêm tab hoặc trình duyệt để thử multiplayer. Mỗi phòng nhận tối đa 20 người.

Model tối ưu và nhạc đã có trong `public/assets`; không cần tự chuẩn bị asset để chạy. Các bản gốc được giữ nguyên tại thư mục gốc và được loại khỏi Git để tránh upload gần 300 MB dữ liệu trùng lặp.

## Có gì trong bản hiện tại

- Bản đồ sân chùa, chính điện với ba tượng GLB được cung cấp, hồ cá, vườn thiền, tháp chuông và sân luyện võ.
- Bầu trời HDRI 2K có mây thật, ánh sáng môi trường, núi xa, nền đá/cỏ PBR, model đá quét 3D, cây bụi và dương xỉ CC0 từ Poly Haven.
- Avatar rig thật, crossfade Walk/Run/Attack/Agree; Idle/Sit/Bow/Pray là pose dựng trên bộ xương, có thở và chuyển tiếp.
- Bốn phối màu của **cùng một model nhân vật**. Bốn GLB gốc là các animation của model này.
- WASD theo camera, giữ Shift để chạy, kéo chuột/vuốt để nhìn, lăn chuột để zoom; joystick trên điện thoại.
- Rapier + Ecctrl, collision, camera tự thu gần, A* cho tùy chọn nhấp để đi tới.
- E hiện theo vị trí: dâng hương, gửi lời nguyện riêng tư/công khai, ngồi thiền, thỉnh chuông. Khóa di chuyển khi làm nghi lễ.
- Multiplayer thật, nội suy nhân vật, chat toàn phòng, bong bóng chat và emote. NPC được ghi rõ là NPC.
- Giao đấu tự nguyện ở võ đài: HP 100, đòn đánh giảm 14 HP, cooldown 700 ms, tầm 2,4 m, hồi sinh sau 5 giây. Server quyết định sát thương; chỉ người đã bật giao đấu mới nhận đòn.
- Nhạc nền được cung cấp, chuông tổng hợp, mute, Low/Medium/High, chế độ ngày/đêm và loading.
- Hồ sơ khách ký cookie HttpOnly; Drizzle + Neon lưu hồ sơ và lời nguyện. Di chuyển và chat không ghi vào database.
- Model/nhạc/texture phục vụ từ Neon S3 bằng URL ký; sổ lời nguyện công khai cập nhật trực tiếp qua Neon Realtime, không cần Neon Auth.

Đây là nền tảng MVP có thể chơi và kiểm thử local. Chưa đo hiệu năng 20 thiết bị cùng lúc, chưa phát hành công khai, chưa có liên kết tài khoản Better Auth hay các clip nghi lễ do animator tạo riêng.

## Điều khiển

| Thao tác | PC |
| --- | --- |
| Đi / chạy | WASD / giữ Shift |
| Xoay / zoom camera | Kéo chuột / lăn chuột |
| Tương tác / đứng dậy | E |
| Chat | Enter |
| Bản đồ | M |
| Đánh khi đã vào giao đấu | F hoặc nút Đánh |
| Đóng cửa sổ / ngừng thiền | Esc |

Điện thoại: joystick bên trái, vuốt vùng cảnh để xoay camera, nút E bên phải. Nhấp để đi tới được bật trong Cài đặt; WASD sẽ hủy đường đi tự động.

## Dữ liệu và môi trường

Dùng `.env.example` để tham khảo, giữ thông tin thật trong `.env`/`.env.local`. Không ghi đè `.env` đã có.

| Biến | Nơi sử dụng |
| --- | --- |
| `DATABASE_URL` | Server Next.js; chuỗi kết nối Neon. `NEON_KEY` hiện có cũng được hỗ trợ nếu giá trị là chuỗi PostgreSQL. |
| `SESSION_SECRET` | Server Next.js; ít nhất 32 ký tự ngẫu nhiên. Bắt buộc khi chạy production. |
| `NEXT_PUBLIC_REALTIME_URL` | URL gốc server phòng: local `ws://localhost:1999`, production `wss://…workers.dev`. |
| `ALLOWED_ORIGIN` | Worker Cloudflare; origin chính xác của frontend, gồm `https://`. |
| `NEON_STORAGE_ENDPOINT`, `NEON_STORAGE_ACCESS_KEY_ID`, `NEON_STORAGE_SECRET_ACCESS_KEY`, `NEON_STORAGE_REGION`, `NEON_STORAGE_BUCKET` | Server/script dùng Neon Object Storage, bucket hiện tại `pagoda`. Code vẫn hỗ trợ tên `AWS_*` cũ khi chạy local. |
| `NEON_REALTIME_URL`, `NEON_REALTIME_SECRET` | Server niêm phong truy vấn công khai; client nhận quyền đọc có hạn, không nhận secret. |
| `NEON_DATA_API_URL`, `NEON_DATA_API_TOKEN` | Tùy chọn PostgREST. Khi chưa có JWT, tiếp tục đọc qua SQL; không tự bật Auth. |
| `NEON_AUTH_URL`, `NEON_JWKS_URL` | URL tham khảo có tên biến rõ ràng; chưa được sử dụng và không kích hoạt Auth. |

```powershell
pnpm db:migrate
```

Migration bổ sung bảng/view có tiền tố `vto_`. Runner chỉ chạy danh sách chuẩn trong `src/lib/migrations.ts`, bỏ qua SQL ngoài danh sách, gồm baseline trùng của PR #1. `0002_restore_validation.sql` bổ sung CHECK bị thiếu nếu database từng được tạo bằng baseline đó; không sửa/xóa hồ sơ hoặc lời nguyện. Metadata Drizzle khớp baseline hiện có. View `vto_public_prayers` chỉ có lời nguyện công khai; các role Data API không được đọc bảng hồ sơ hay nguồn lời nguyện riêng tư. Không có database thì hồ sơ khách vẫn dùng cookie, lời nguyện chỉ ở bộ nhớ process; UI/API ghi rõ chế độ lưu trữ. Dữ liệu bộ nhớ không bền vững khi restart hoặc giữa nhiều instance. Xem [quy tắc migration](docs/MIGRATIONS.md).

`.env.local` local có secret riêng đã được tạo và nằm trong `.gitignore`. Khi deploy, tự cấu hình một secret mới trên host; không đưa secret vào biến `NEXT_PUBLIC_*`.

## Kiểm tra

```powershell
pnpm check          # TypeScript web + Worker và các bài kiểm tra logic
pnpm build          # Build frontend production
pnpm build:netlify  # Chạy Netlify CLI build local, có adapter và kiểm tra output; không deploy
pnpm smoke          # Cần pnpm dev đang chạy; kiểm tra API/Neon và hai WebSocket client
pnpm test:ui        # Cần pnpm dev + Chrome đã cài; ảnh kết quả trong artifacts/
pnpm smoke:neon     # Hai kết nối Neon thật, riêng tư, S3 checksum/range; tự dọn UUID QA
pnpm realtime:check # Kiểm tra subscription upstream, không in secret
pnpm exec wrangler deploy --dry-run
```

`smoke` tạo dữ liệu QA bằng UUID và tự dọn đúng các bản ghi đó. `test:ui` kiểm tra giao diện, điều khiển, chat, responsive và hai phiên Chrome. Thư mục `artifacts/` không đưa lên Git.

`test:ui` mặc định dùng GPU của Chrome. Khi cần kiểm tra trong môi trường không có GPU, đặt `SMOKE_SOFTWARE_RENDERER=1`; thời gian frame khi render bằng CPU không đại diện cho máy chơi thật. Game tự hạ độ phân giải render khi thiếu FPS và dùng cây đơn giản ở xa; Medium/High vẫn giữ asset chi tiết khi lại gần.

## Deploy Netlify

1. Chạy `pnpm env:netlify` để tạo `.env.netlify` từ cấu hình local. File có tên biến hợp lệ để import, không chứa dòng URL đứng riêng và không được commit.
2. Đưa mã nguồn cùng `public/assets` lên GitHub, kết nối repo với Netlify. `netlify.toml` đã cấu hình `pnpm build`, publish `.next`, khai báo adapter Next.js và plugin kiểm tra output. Build sẽ dừng nếu thiếu function/route/bundle/asset hoặc còn publish thư mục server thô.
3. Import `.env.netlify` trong **Project configuration → Environment variables**, giữ **All scopes** hoặc bao gồm **Builds + Functions**, rồi deploy.
4. Worker đã có `ALLOWED_ORIGIN=https://bespoke-arithmetic-045314.netlify.app` trong `wrangler.jsonc`; sửa giá trị khi đổi domain. Chạy `pnpm deploy:realtime` sau khi đăng nhập Cloudflare. Đặt URL Worker thật dạng `wss://…workers.dev` vào `NEXT_PUBLIC_REALTIME_URL` trên Netlify và deploy lại.
5. Thêm domain Netlify vào allowed origins của Neon Realtime. Thử hai trình duyệt cùng phòng trước khi chia sẻ công khai.

Xem [hướng dẫn Netlify từng bước](docs/DEPLOY_NETLIFY.md), gồm tên biến, import env, server multiplayer và xử lý lỗi. Trên Netlify dùng `NEON_STORAGE_*` thay các biến AWS dành riêng. URL Neon Auth/JWKS được đặt tên nhưng game vẫn đăng nhập bằng khách.

Chưa deploy hay tạo tài nguyên trả phí. Mục tiêu chi phí thấp phụ thuộc hạn mức và số người thực tế; không có cam kết 0đ ở mọi tải. Worker dùng phòng đang hoạt động không hibernate, dừng timer khi phòng hết người. Cần theo dõi usage Cloudflare trước khi mở rộng.

## Tài liệu và cấu trúc

- [GDD](docs/GDD.md): trải nghiệm, luật chơi, không gian, văn hóa và phạm vi.
- [TDD](docs/TDD.md): kiến trúc, giao thức, persistence, bảo mật, giới hạn và vận hành.
- [Roadmap](docs/ROADMAP.md): module, phụ thuộc, tiêu chí nghiệm thu và backlog.
- [Kết quả kiểm tra](docs/VALIDATION.md): các kiểm tra đã chạy, ảnh QA và giới hạn chưa đo.
- [Dịch vụ Neon](docs/NEON_SERVICES.md): S3, Realtime, Data API và ranh giới với server phòng.
- [Deploy Netlify](docs/DEPLOY_NETLIFY.md): GitHub, file import env, Netlify và Cloudflare multiplayer.
- [Asset hình ảnh](docs/SCENE_ASSETS.md): nguồn, giấy phép, cách tái tạo và ngân sách tải.

```text
src/app/                 Next.js, API, CSS
src/components/game/     World, Avatar, Controller, HUD, Network
src/lib/protocol.ts      Hợp đồng client/server
src/lib/world-layout.ts  Collision và tìm đường
src/lib/server/          Session, schema và truy vấn Neon
server/                  Logic phòng dùng chung và Cloudflare Worker
scripts/                 Local realtime, migration, asset pipeline và smoke test
public/assets/           GLB và âm thanh dùng trong game
docs/                    GDD, TDD, roadmap
```

`pnpm assets` tái tạo avatar/tượng từ bản gốc. `pnpm assets:scene` tải và tối ưu bộ asset Poly Haven đã chọn. `pnpm storage:upload` upload/xác minh các file trong allowlist, cập nhật manifest có hash. Không cần decoder/font CDN ngoài lúc chạy. Tổng bộ asset hiện khoảng 27,8 MiB, có cache và không bắt buộc tải mọi file ở mọi cảnh; bản gốc giữ nguyên.
