# Đưa game lên Netlify

Web Next.js/API chạy trên Netlify; server phòng game chạy trên Cloudflare; database, asset và sổ lời nguyện tiếp tục dùng Neon. Bạn bè mở link HTTPS của Netlify để chơi, không cần máy phát triển chạy liên tục.

## 1. Tạo file env để import

Mọi dòng cấu hình phải có dạng `TEN_BIEN=gia_tri`. Dòng chỉ chứa URL không được Netlify nhận thành biến. Chuỗi PostgreSQL kết thúc ở phần tham số URL, không thêm dấu `;` như câu lệnh SQL.

```powershell
pnpm env:netlify
pnpm env:check --file .env.netlify
```

Lệnh đầu đọc `.env` rồi `.env.local`, chuẩn hóa tên biến và tạo `.env.netlify` ở gốc dự án. File này chứa credential thật, chỉ dùng để import; `.gitignore` đã loại khỏi Git. Các giá trị còn thiếu được báo bằng tên biến, không in secret ra console.

| Nội dung | Tên biến dùng khi deploy |
| --- | --- |
| PostgreSQL URL | `DATABASE_URL` (`NEON_KEY` cũ vẫn được hỗ trợ) |
| Khóa ký phiên khách | `SESSION_SECRET` |
| S3 endpoint | `NEON_STORAGE_ENDPOINT` |
| S3 access key | `NEON_STORAGE_ACCESS_KEY_ID` |
| S3 secret key | `NEON_STORAGE_SECRET_ACCESS_KEY` |
| Vùng và bucket | `NEON_STORAGE_REGION`, `NEON_STORAGE_BUCKET` |
| Realtime SQL endpoint và secret | `NEON_REALTIME_URL`, `NEON_REALTIME_SECRET` |
| REST endpoint | `NEON_DATA_API_URL` |
| Auth/JWKS endpoint, chỉ lưu tham khảo | `NEON_AUTH_URL`, `NEON_JWKS_URL` |
| WebSocket server phòng game | `REALTIME_URL` (ưu tiên), hoặc legacy `NEXT_PUBLIC_REALTIME_URL` |

Code vẫn đọc tên `AWS_*` cũ khi chạy local; trên Netlify dùng nhóm `NEON_STORAGE_*` để tránh các biến AWS được nền tảng giữ riêng. Các [biến AWS dành riêng là chỉ đọc trong Netlify Functions](https://docs.netlify.com/build/functions/environment-variables/).

`NEON_REALTIME_URL` phục vụ sổ lời nguyện, khác với server phòng game. `NEON_AUTH_URL`/`NEON_JWKS_URL` không kích hoạt đăng nhập Neon; game tiếp tục dùng khách. Data API chỉ được sử dụng khi có thêm `NEON_DATA_API_TOKEN` hợp lệ; thiếu token thì ứng dụng vẫn đọc qua PostgreSQL.

## 2. Kết nối GitHub với Netlify

1. Đưa mã nguồn, `public/assets`, manifest storage và lockfile lên repo GitHub. Giữ `.env`, `.env.local`, `.env.netlify`, `.next`, `.netlify` và `node_modules` ngoài Git. Thay các credential đã được chia sẻ trước khi phát hành công khai.
2. Trong Netlify, chọn thêm project từ Git, kết nối GitHub rồi chọn repo.
3. `netlify.toml` đã đặt **Build command: `pnpm build`**, **Publish directory: `.next`**. Base directory để gốc repo. `.nvmrc` chọn Node.js 22; `packageManager` trong `package.json` chọn phiên bản pnpm.
4. Vào **Project configuration → Environment variables → Import from a .env file**, import `.env.netlify`. Để mặc định **All scopes**; nếu có chọn scope thì phải bao gồm **Builds** và **Functions**. Chọn giá trị cho production hoặc cùng giá trị cho các context bạn sử dụng.
5. Deploy, lấy domain cố định dạng `https://TEN-GAME.netlify.app`.

Repo khai báo rõ `@netlify/plugin-nextjs` trong `netlify.toml` để adapter Next.js/OpenNext luôn được chạy khi build từ Git, kể cả khi nhận diện framework bị bỏ qua. Không ghim phiên bản adapter trong package.json. Plugin `plugins/verify-next-output` chạy sau adapter và dừng build nếu thiếu function bắt route `/`/`/api/*`, thiếu bundle/asset hoặc vẫn đang publish thư mục server thô. Giữ Next.js hiện tại; không đổi thành static export, không chọn thư mục `out`, không thêm redirect SPA `/* → /index.html`. [Next.js trên Netlify](https://docs.netlify.com/build/frameworks/framework-setup-guides/nextjs/overview/)

Secret phải được import qua UI/CLI, không đặt trong `netlify.toml`: biến khai báo ở file TOML chỉ dành cho build, không có sẵn cho Functions lúc chạy. `REALTIME_URL` được đọc ở server lúc chạy qua `/api/realtime/config` với `no-store`; client không phụ thuộc URL bị đóng cứng vào bundle. Netlify vẫn yêu cầu redeploy sau khi thay env để Functions nhận cấu hình mới. [Import env](https://docs.netlify.com/build/environment-variables/get-started/), [scope của Functions](https://docs.netlify.com/build/functions/environment-variables/)

## 3. Bật multiplayer qua Cloudflare

Worker hiện đã online tại `https://virtual-temple-realtime.phamvietanh19218.workers.dev`. Production mặc định kết nối Worker này qua cấu hình công khai `src/lib/realtime-default.json`; không cần dán thêm khóa. Local development tiếp tục dùng server cổng 1999. Hai tab dùng chung cookie vẫn có ID nhân vật mạng riêng. Khi online, badge hiện số người như `2/20`; nếu server lỗi, game hiển thị trạng thái ngắt kết nối và nút thử lại thay vì gọi đó là phòng solo.

1. `wrangler.jsonc` đã có origin `https://bespoke-arithmetic-045314.netlify.app`. Khi đổi domain, sửa giá trị `ALLOWED_ORIGIN` hiện có, không thêm một mục `vars` trùng:

   ```json
   "vars": { "ALLOWED_ORIGIN": "https://TEN-GAME.netlify.app" }
   ```

2. Đăng nhập và deploy server phòng:

   ```powershell
   pnpm exec wrangler login
   pnpm deploy:realtime
   ```

3. Nếu dùng Worker khác, đặt `REALTIME_URL` trên Netlify Functions bằng URL gốc Wrangler trả về. Có thể dùng `https://` hoặc `wss://`; API chuẩn hóa sang WebSocket bảo mật. Không thêm `/parties/temple/...`. Biến `NEXT_PUBLIC_REALTIME_URL` chỉ là alias cũ, ưu tiên thấp hơn `REALTIME_URL`.
4. Thêm `https://TEN-GAME.netlify.app` vào allowed origins của **Neon Realtime** theo [hướng dẫn Neon](NEON_SERVICES.md#lấy-realtime-secret-và-cho-phép-origin). Domain này phải trùng origin mà trình duyệt đang mở. Nếu đổi domain chính hoặc dùng custom domain, cập nhật cả Worker và Neon.
5. Deploy lại Netlify. Có thể tái tạo và kiểm tra file import bằng Worker URL thật:

   ```powershell
   pnpm env:netlify --room-url https://TEN-WORKER.TEN-ACCOUNT.workers.dev
   pnpm env:check --file .env.netlify --require-multiplayer
   ```

Lệnh kiểm tra env xác nhận cấu hình local, không thay thế việc deploy và kiểm tra kết nối thực tế.

## 4. Kiểm tra link trước khi gửi bạn bè

Mở hai trình duyệt ở cùng domain Netlify, chọn cùng phòng. Xác nhận cả hai thấy nhau di chuyển, chat và emote; gửi lời nguyện công khai để kiểm tra Realtime, gửi lời riêng để kiểm tra quyền riêng tư; tải model, nghe nhạc và thử joystick trên điện thoại. Kiểm tra `/api/guest` lưu được hồ sơ, không chạy chế độ dữ liệu bộ nhớ.

| Hiện tượng | Cần kiểm tra |
| --- | --- |
| `/` trả 404 nhưng `/server/app/index.html` trả 200 | Đã publish `.next` thô. Build lại từ Git với adapter; kiểm tra log có Next.js Runtime và plugin verify output. Import env không sửa được routing |
| Import env báo tên không hợp lệ | Không dùng dòng URL đứng riêng; import `.env.netlify`, không dùng tên `AWS_*` |
| Web lên nhưng không lưu được hồ sơ | `DATABASE_URL`, `SESSION_SECRET` và Functions scope |
| Model từ storage không tải | Đủ nhóm `NEON_STORAGE_*`; endpoint, region và bucket đúng |
| Chơi một mình, không thấy nhau | Worker đã deploy, URL `wss://` đúng, `ALLOWED_ORIGIN` đúng domain, web đã build lại |
| Hai tab cùng tên nhưng không thấy nhau | Xem badge phải hiện số người online; cookie chung không gộp hai kết nối. Kiểm tra `/api/realtime/config` trả `configured: true` và đúng Worker |
| Lời nguyện có sẵn nhưng không live | Secret Realtime và allowed origins của Neon |
| REST endpoint yêu cầu JWT | Giữ SQL fallback; không cần bật Auth cho bản hiện tại |

Cấu hình trong repo chỉ chuẩn bị cho deploy. Repo, tài khoản host, domain và Worker thật phải được liên kết trước khi có thể xác nhận game đã online.

## 5. Cập nhật site hiện tại sau lỗi 404

Push bản sửa trên nhánh `main`, gồm `netlify.toml` và toàn bộ `plugins/verify-next-output`. Trên site **bespoke-arithmetic-045314**, chọn **Deploys → Trigger deploy → Clear cache and deploy site**. Nếu tên nút thay đổi, chọn thao tác build mới từ nhánh Git production. Không publish lại bản upload `.next` cũ.

Log cần có **Next.js Runtime**, bước plugin `@netlify/plugin-nextjs`, thông báo **Verified Netlify Next.js output** và function **Next.js Server Handler**. Một trang `Ready` chỉ xác nhận deploy đã hoàn thành, không thay thế việc mở `/` và `/api/guest`. Preview có thể yêu cầu đăng nhập Netlify; đó không phải lỗi 404 của ứng dụng. Đảm bảo bản production được publish từ commit mới trên `main`.

Không cần merge PR #1 cũ để sửa 404: PR đó tạo SQL trùng, không thay pipeline Netlify. Bản sửa hiện tại đã dùng baseline và metadata chuẩn; xem [migration](MIGRATIONS.md). Xóa `NETLIFY_NEXT_PLUGIN_SKIP` nếu đã đặt trên host.

Để kiểm tra pipeline trên máy có môi trường hỗ trợ adapter:

```powershell
pnpm check
pnpm build:netlify
```

Lệnh thứ hai chỉ build, không đăng nhập, không publish. Windows có thể báo EPERM khi adapter sao chép symlink, kể cả với pnpm hoisted vì Next.js cũng tạo symlink trong standalone output. Không cần thay quyền hệ thống để deploy Git trên Netlify Linux. Lượt xác minh bản sửa dùng bản sao riêng và công cụ thử nghiệm Windows để sao chép file thay symlink; không thay adapter hoặc ứng dụng gửi lên Git. Chi tiết trong [kết quả kiểm tra](VALIDATION.md).
