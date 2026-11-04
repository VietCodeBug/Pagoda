# Migration database

`pnpm db:migrate` là runner của game; không dùng bảng lịch sử migrate của Drizzle. Runner thực hiện các migration bổ sung có thể chạy lại, theo đúng danh sách `MIGRATION_FILES` trong `src/lib/migrations.ts`:

1. `0000_virtual_temple.sql`: baseline hiện có, tạo bảng/index nếu chưa tồn tại.
2. `0001_public_prayer_api.sql`: view công khai và quyền đọc cho Data API, giữ bảng hồ sơ/lời riêng ngoài quyền anonymous.
3. `0002_restore_validation.sql`: khôi phục CHECK avatar 0–3 và độ dài lời nguyện 1–500 nếu bị thiếu. Nếu dữ liệu cũ vi phạm CHECK, migration thất bại để người vận hành xử lý; không tự sửa/xóa dữ liệu.

Các file SQL khác, gồm `0000_little_mathemanic.sql` do PR #1 tạo trùng, không được chạy và có cảnh báo. Không merge baseline trùng để giải quyết deploy Netlify. Journal/snapshot trong `drizzle/meta` mô tả schema và thứ tự sinh migration; không có nghĩa database đã thực hiện chúng.

Khi thêm migration mới, cập nhật danh sách chuẩn và metadata tương ứng. Dùng dòng `--> statement-breakpoint` giữa các statement, giữ nguyên khối `DO $$ ... $$` hoặc chuỗi có dấu `;`; runner không cắt SQL theo mọi dấu chấm phẩy.

Schema TypeScript khai báo CHECK và index đúng với baseline. Có thể dùng `pnpm exec drizzle-kit check` để kiểm tra metadata; khi schema không đổi, Drizzle generate phải không sinh DDL mới. Không tự chạy `drizzle-kit migrate` thay cho runner mà chưa lập kế hoạch chuyển đổi lịch sử.

`pnpm test` có kiểm tra plan/split và PostgreSQL trong bộ nhớ qua PGlite cho database mới, database đã có dữ liệu và database tạo bằng PR #1. Các kiểm tra này không kết nối Neon hoặc sửa dữ liệu production.

Deploy Netlify chỉ build và đóng gói web/API. Không chạy migration trong build, không dùng credential database trên client. Chỉ chạy `pnpm db:migrate` riêng khi cần áp dụng thay đổi lên database đã chọn.
