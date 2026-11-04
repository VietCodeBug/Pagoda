# Cảnh quan và asset

Các asset tải thêm đều từ Poly Haven, giấy phép CC0. File `public/assets/scene-credits.json` lưu nguồn trực tiếp, giấy phép, kích thước và SHA-256 của từng file. Không dùng ảnh preview của nhà cung cấp làm nội dung game.

| Thành phần | Nguồn | Xử lý cho web |
| --- | --- | --- |
| Bầu trời có mây | [Kloofendal 48d Partly Cloudy PureSky](https://polyhaven.com/a/kloofendal_48d_partly_cloudy_puresky) | HDRI 2K, ánh sáng môi trường và nền cùng nguồn |
| Sàn đá | [Stone Floor](https://polyhaven.com/a/stone_floor) | Color/normal/ARM 1K, JPEG |
| Cỏ/đất | [Aerial Grass Rock](https://polyhaven.com/a/aerial_grass_rock) | Color/normal/ARM 1K, repeat theo tỷ lệ cảnh |
| Vườn lát đá rêu | [Mossy Cobblestone](https://polyhaven.com/a/mossy_cobblestone) | Color/normal/ARM 1K |
| Đá lớn | [Boulder 01](https://polyhaven.com/a/boulder_01) | GLB nhúng ảnh 1K, 3,87 MiB |
| Cụm đá phủ rêu | [Rock Moss Set 01](https://polyhaven.com/a/rock_moss_set_01) | GLB nhúng ảnh 1K, 1,92 MiB |
| Tán cây/bụi | [Shrub 04](https://polyhaven.com/a/shrub_04) | GLB 1,14 MiB; dùng lại geometry/texture, tint vật liệu riêng |
| Dương xỉ | [Fern 02](https://polyhaven.com/a/fern_02) | GLB 0,53 MiB; giảm số cụm ở Low |

Các model tham khảo rất lớn như pine tree gần 1 GB đã được loại khỏi bộ tải. Chỉ lấy các model nhỏ đủ phù hợp trình duyệt. Kiến trúc chùa và thân cây tiếp tục dựng từ code; avatar/tượng/nhạc là tài sản người dùng cung cấp.

```powershell
pnpm assets:scene
pnpm storage:upload
```

Pipeline tải Poly Haven giới hạn source đơn lẻ 25 MB, nén texture xuống 1024, gộp glTF và ảnh vào GLB, giữ cache nguồn trong `.wrangler/scene-source-cache`. Tổng bộ cảnh tải thêm khoảng 16 MiB; allowlist hiện có 23 file, 31.303.402 byte, gồm các model người dùng và clip đấm mới. Các asset được đưa vào bucket `pagoda` theo key có hash; các object cũ/khác giữ nguyên.

## Tượng ngoài vườn và động tác đấm

Nguồn `tượng phật ngoài vườn.glb` do người dùng cung cấp được giữ nguyên. `pnpm assets:garden` tạo `garden-buddha.glb`: 857.074 → 54.935 đỉnh (-93,59%), 1.495.918 → 59.836 tam giác (-96%), 93.488.364 → 2.139.048 byte; ba texture 4K thành JPEG 1K. Metadata SHA-256/thông số nằm trong `public/assets/garden-buddha.metadata.json`. Tượng cao 4 m trên bệ, đặt tại (-18, -14.2) ở vườn thiền; có collider và vùng tránh camera tương ứng. Đã so sánh mặt/dáng trước sau và đi đến tượng trong game. GLB có 0 lỗi, 1 cảnh báo tangent kế thừa.

`pnpm assets:punch` tạo `punch.glb` 35.900 byte: clip jab/cross/thu về thế thủ dài 0,68 giây trên cùng rig nhân vật. Clip-only nên không tải lặp mesh. Avatar dùng clip mới cho attack và giữ clip gầm cũ ngoài combat. GLB có 0 lỗi/0 cảnh báo; test kiểm tra track binding, tầm tay, chân đứng ổn định và pose kết thúc. Cả hai asset mới đã upload S3 và kiểm tra checksum.

Tất cả bốn GLB cảnh mới đã qua Khronos glTF Validator với 0 lỗi. Các cảnh báo tangent kế thừa không ngăn Three.js render. Chưa có benchmark FPS trên điện thoại thật; cần đo trước khi tăng số tán cây hoặc nâng texture lên 2K/4K.

Tham khảo [giấy phép của Poly Haven](https://polyhaven.com/license). Ngày chuẩn bị: 04/11/2026.
