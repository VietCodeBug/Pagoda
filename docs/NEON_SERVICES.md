# Neon: database, file và cập nhật trực tiếp

Hướng dẫn cho bản game ngày 04/11/2026. Đăng nhập người chơi vẫn là khách bằng cookie ký; Neon Auth và JWKS không được tích hợp.

## Ba luồng dữ liệu

| Luồng | Dịch vụ và trách nhiệm |
| --- | --- |
| Hồ sơ, lời nguyện | PostgreSQL qua Drizzle; `DATABASE_URL` hoặc `NEON_KEY` |
| Model, nhạc | Neon Object Storage, bucket `pagoda`; client gọi `/api/assets/<tên-file>` |
| Sổ lời nguyện công khai | Neon Realtime SQL, SDK subscribe một truy vấn được server niêm phong |
| Vị trí, chat phòng, HP | Server phòng WebSocket hiện có; `NEXT_PUBLIC_REALTIME_URL` |

Neon Realtime SQL không thay thế server quyết định sát thương và hành động trong game. Tọa độ di chuyển không được ghi liên tục vào PostgreSQL.

## Biến môi trường

Giữ giá trị thật trong `.env`/`.env.local` khi chạy local và trong Environment Variables của host khi deploy. Những biến server dưới đây không có tiền tố `NEXT_PUBLIC_`.

| Biến | Ý nghĩa |
| --- | --- |
| `DATABASE_URL` hoặc `NEON_KEY` | Chuỗi kết nối PostgreSQL hiện có |
| `SESSION_SECRET` | Ký phiên khách của game |
| `NEON_STORAGE_ENDPOINT` | Endpoint Object Storage của nhánh Neon |
| `NEON_STORAGE_ACCESS_KEY_ID` | ID credential S3 |
| `NEON_STORAGE_SECRET_ACCESS_KEY` | Secret S3, chỉ dùng trên server/script upload |
| `NEON_STORAGE_REGION` | Vùng storage, hiện `us-east-2` |
| `NEON_STORAGE_BUCKET` | `pagoda` |
| `NEON_REALTIME_URL` | Endpoint Live SQL API, dạng `https://…rt.…neon.tech/`; code chuẩn hóa sang `wss:` |
| `NEON_REALTIME_SECRET` | Secret riêng dùng niêm phong truy vấn Realtime |
| `NEON_REALTIME_DATABASE` | Tùy chọn; mặc định lấy tên database từ chuỗi PostgreSQL |
| `NEON_DATA_API_URL`, `NEON_DATA_API_TOKEN` | REST endpoint và JWT tùy chọn; thiếu JWT thì đọc qua SQL |
| `NEON_AUTH_URL`, `NEON_JWKS_URL` | URL tham khảo; không được gọi, không bật Auth |

Các tên cũ `AWS_ENDPOINT_URL_S3`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_REGION` vẫn được hỗ trợ cho môi trường local. Trên Netlify dùng nhóm `NEON_STORAGE_*`: Netlify Functions có biến AWS dành riêng và không cho ghi đè. Chạy `pnpm env:netlify` để tạo file `.env.netlify` có thể import qua UI; file nằm ngoài Git. Xem [deploy Netlify](DEPLOY_NETLIFY.md).

`NEXT_PUBLIC_REALTIME_URL` là URL **server phòng game** đang chạy bằng Node khi phát triển hoặc Cloudflare Worker khi deploy. Giá trị này khác `NEON_REALTIME_URL`, vốn phục vụ thay đổi dữ liệu trong sổ lời nguyện.

## Model và âm thanh trên S3

Chỉ file trong allowlist của ứng dụng được upload và phục vụ. Hiện có 21 file, gồm:

- `avatar.glb`
- `buddha-center.glb`, `buddha-left.glb`, `buddha-right.glb`
- `temple-ambient.mp3`
- `manifest.json`
- HDRI, texture PBR, model cảnh và `scene-credits.json` được liệt kê trong `src/lib/assets.ts`.

Chạy lại sau khi thay đổi asset tối ưu:

```powershell
pnpm exec tsx scripts/upload-assets.ts
```

Script đọc file trong `public/assets`, tính SHA-256, upload vào key `vto/v1/<sha256>/<tên-file>`, rồi tải lại để đối chiếu kích thước và checksum. File có cùng hash được xác minh và dùng lại. Các object khác trong bucket được giữ nguyên. Kết quả nằm trong `src/lib/server/storage-manifest.json`; commit manifest cùng mã nguồn khi phát hành.

File gốc ở thư mục dự án và bản tối ưu local không bị xóa. Không có cấu hình storage thì route chuyển về `/assets/<tên-file>`; cấu hình storage không đầy đủ hoặc upstream lỗi sẽ trả lỗi rõ ràng.

Trình duyệt gọi URL cùng origin `/api/assets/<tên-file>`. Route kiểm tra allowlist, rồi GET trả redirect `307` tới presigned URL của đúng object. Secret S3 không đi vào bundle client. Route hỗ trợ HEAD và một byte range hợp lệ, phù hợp nhạc nền; yêu cầu range sai được từ chối. Alias route cache ngắn vì manifest có thể đổi, còn object có hash trong key có thể cache lâu.

Bucket `pagoda` đã có CORS cho GET/HEAD từ trình duyệt; cấu hình CORS hiện có được giữ nguyên. Cách làm này tránh truyền toàn bộ model/nhạc qua response body của serverless Function. Tham khảo [download, byte range và presigned URL của Neon](https://neon.com/docs/storage/objects).

## Sổ lời nguyện cập nhật trực tiếp

Server chỉ niêm phong truy vấn cố định này:

```sql
SELECT id, name, text, created_at AS "createdAt"
FROM public.vto_prayers
WHERE is_public = true
ORDER BY created_at DESC, id DESC
LIMIT 40
```

`POST /api/prayers/live-query` trả `{ url, sealedQuery }` với cache `private, no-store`. Client không gửi SQL, player ID hay điều kiện lọc. Capability chỉ cho phép đăng ký đúng truy vấn công khai; password PostgreSQL và Realtime secret ở lại server.

Hook `usePublicPrayers(enabled)` mở kết nối trực tiếp từ trình duyệt tới Neon khi người chơi mở sổ. Hook trả `prayers`, `status`, `message`, `refresh`; các trạng thái gồm `connecting`, `live`, `reconnecting`, `unavailable`. SDK `QueryRefreshController` gia hạn capability trước khi hết hạn; đóng sổ sẽ hủy subscription và kết nối liên quan.

Khi Realtime chưa cấu hình hoặc tạm lỗi, sổ vẫn thực hiện một lần đọc HTTP để hiển thị lời nguyện đã lưu và báo trạng thái phù hợp. Không có vòng polling được gắn nhãn là cập nhật trực tiếp. Lời nguyện riêng tư không nằm trong truy vấn live.

Neon Realtime đang beta và chưa hỗ trợ RLS; giới hạn dữ liệu bằng truy vấn cố định được niêm phong tại server. Bảng `vto_prayers` đã có primary key nên không cần thay đổi replica identity cho luồng này. Xem [truy vấn và niêm phong](https://neon.com/docs/realtime/guides/queries) cùng [ví dụ Next.js](https://neon.com/docs/realtime/examples/nextjs).

## Lấy Realtime secret và cho phép origin

1. Mở Neon Console, chọn đúng project/nhánh, vào **Postgres database → Realtime**.
2. Lấy `NEON_REALTIME_URL` và `NEON_REALTIME_SECRET` đang hiển thị, điền vào môi trường server. Secret này khác mật khẩu database, secret S3 và `SESSION_SECRET`.
3. Nếu Neon CLI đã được đăng nhập và liên kết đúng project, có thể dùng `neon env pull --service realtime` để lấy hai biến. Kiểm tra các giá trị cấu hình khác được giữ đúng sau khi cập nhật file môi trường.
4. Đặt origin được phép cho Realtime gồm `http://localhost:3000` khi phát triển và origin Netlify chính xác khi phát hành.

Ví dụ cấu hình Neon, chỉ thêm dịch vụ Realtime:

```ts
import { defineConfig } from '@neon/config/v1';

export default defineConfig({
  preview: {
    realtime: {
      allowedOrigins: [
        'http://localhost:3000',
        'https://TEN-GAME.netlify.app',
      ],
    },
  },
});
```

Thay origin mẫu bằng domain thật. `neon deploy` trong thư mục đã liên kết đúng project áp dụng cấu hình Neon; đây là bước riêng với deploy Next.js lên Netlify. Không có `auth: true` trong cấu hình trên.

Endpoint Realtime đã được cung cấp cho nhánh hiện tại; không cần bật lại dịch vụ để tích hợp code. Việc bật Realtime mới trên một project có thể thay đổi `wal_level` và ngắt compute đang chạy, nên đối chiếu trạng thái nhánh trước khi cấu hình. Xem [Quickstart](https://neon.com/docs/realtime/quickstart) và [Overview](https://neon.com/docs/realtime/overview).

## Kiểm tra và trạng thái bàn giao

```powershell
pnpm typecheck
pnpm test
pnpm exec tsx scripts/setup-realtime.ts --probe
```

- PostgreSQL: đã kiểm tra kết nối và bảng game.
- S3: 21 file đã upload/xác minh SHA-256 trên bucket `pagoda`; GET redirect và byte range âm thanh đã kiểm tra thực tế.
- Realtime: secret server đã cấu hình, upstream báo `live`; hai subscription nhận insert/delete, loại lời nguyện riêng. Trình duyệt đã kết nối trực tiếp và hiển thị bài mới.
- Neon Auth/JWKS: giữ ngoài phạm vi theo yêu cầu.

Sau khi có secret, kiểm tra hai trình duyệt mở sổ: gửi một lời nguyện công khai từ phiên thứ nhất và xác nhận phiên thứ hai cập nhật; gửi lời nguyện riêng và xác nhận không xuất hiện. Kiểm tra trên trình duyệt thật còn xác nhận được allowed origins, điều mà một kết nối SDK từ Node không chứng minh được.

## Data API được bổ sung

`NEON_DATA_API_URL` lưu endpoint REST do người dùng cung cấp. Nhánh hiện tại trả lỗi yêu cầu JWT nếu gọi không có token. Theo yêu cầu không tích hợp Auth, ứng dụng không gọi Neon Auth/JWKS để lấy token. Adapter server `data-api.ts` chỉ bật khi có thêm `NEON_DATA_API_TOKEN` hợp lệ; nếu chưa có, các truy vấn tiếp tục dùng Drizzle/PostgreSQL đang hoạt động.

Migration `0001_public_prayer_api.sql` chỉ cho các role API đọc view `vto_public_prayers` gồm lời nguyện công khai. Bảng `vto_players` và `vto_prayers` không cấp quyền trực tiếp cho `anonymous`/`authenticated`, bảo vệ hồ sơ và lời riêng tư khi Data API đã được bật. Không thay quyền các bảng ngoài tiền tố game.
