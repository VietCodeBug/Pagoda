# Hoạt động và sổ thành tích

Nhấn **G** hoặc **Hoạt động** để mở bảng 8 hoạt động. Nút chỉ đường dùng A* để đi đến đúng vị trí; **E** thực hiện hành động gần đó, **Esc** rời lượt chơi. Mobile có các nút tương đương. Chỉ hoạt động khi đã vào phòng online; NPC không được tính là người online.

| Hoạt động | Cách chơi |
| --- | --- |
| Câu cá thư giãn | Đến bến bên hồ, E bắt đầu, E thả câu, chờ phao rồi E giật cần trong cửa sổ 1,8 giây |
| Hội câu cá | Thi theo phòng trong 3 phút; bảng xếp hạng cập nhật từ cá thật đã bắt, có thưởng cuối lượt |
| Săn sen | Tìm 10 đóa sen trong 90 giây; đến gần từng đóa rồi E nhặt |
| Đường đua | Qua 8 checkpoint theo thứ tự; tự ghi nhận khi chạy vào cổng, lưu thời gian nhanh nhất |
| Nhớ tiếng chuông | Nghe chuỗi 4 âm sắc, nhắc lại bằng nút hoặc phím 1–4; hoàn thành 5 vòng |
| Đêm hội thả đèn | Cùng phòng thả 12 đèn trong 90 giây; mỗi người cách ít nhất 2 giây giữa hai đèn, một người vẫn có thể chơi |
| Luyện quyền | Đến mộc nhân, E đấm trong 30 giây, mỗi đòn cách tối thiểu 700 ms |
| Đấu tay đôi | Vào võ đài và cùng bật giao đấu; HP, sát thương, cooldown và hồi sinh do server xử lý |

## Cá và phần thưởng

Có 12 loài và 5 độ hiếm. Xác suất mỗi lần bắt thành công: phổ thông 57%, đặc biệt 25%, hiếm 12%, sử thi 5%, huyền thoại 1%. Trong từng bậc, loài được chọn theo trọng số riêng; kích thước nằm trong giới hạn của loài. Các con số này không bảo đảm cá hiếm xuất hiện sau một số lượt cố định.

Sổ cá lưu số lượng và kích thước lớn nhất từng loài. Sổ thành tích lưu số lượt, điểm cao nhất hoặc thời gian đua nhanh nhất. Xu và XP là tiến trình trò chơi, tách khỏi công đức và nghi lễ. Chưa có cửa hàng hoặc cơ chế nạp tiền.

## Xác nhận và lưu dữ liệu

Server phòng kiểm tra vị trí, thời gian, thứ tự checkpoint/âm chuông và cooldown trước khi tạo phần thưởng. Client không được truyền điểm, loài cá hoặc xu tự chọn.

`GET /api/game/session` đọc phiên khách đã ký, cấp ticket ngắn hạn và trả tiến trình của đúng hồ sơ. Worker xác minh ticket và gắn kết nối với hồ sơ. Sau mỗi kết quả hợp lệ, Worker ký receipt có profileId/ID phần thưởng/thời hạn. `POST /api/game/claim` kiểm tra chữ ký, thời hạn và chủ hồ sơ; PostgreSQL dùng một CTE nguyên tử để ghi ledger, ví, cá và thành tích. Trùng ID không cộng thêm lần hai. `GET /api/game/progress` chỉ trả dữ liệu hồ sơ trong cookie hiện tại.

Migration `0003_game_progress.sql` bổ sung `vto_game_wallets`, `vto_fish_collection`, `vto_activity_scores`, `vto_game_claims`; không đặt lại dữ liệu cũ. Role Data API anonymous/authenticated không đọc các bảng này. Khóa chỉ ở server. Mặc định web dùng SESSION_SECRET, Worker giữ cùng giá trị dưới tên GAME_REWARD_SECRET; có thể đặt GAME_REWARD_SECRET riêng trên cả hai host. Nếu đổi khóa hiệu lực ở một host, phải đồng bộ host còn lại. Không đưa giá trị này vào Git hoặc biến NEXT_PUBLIC.

## Tài sản và triển khai

`punch.glb` là clip jab/cross/recovery 0,68 giây được tạo trên rig nhân vật hiện tại; clip gầm cũ không dùng cho attack. `garden-buddha.glb` là bản giảm đỉnh của tượng ngoài vườn do người dùng cung cấp. Các asset mới đã upload Neon S3 bằng đường dẫn có hash.

Backend multiplayer hiện đã được cập nhật và migration đã áp dụng. Web cần push/deploy Netlify để hiện menu và các route mới. Với một môi trường mới: chạy `pnpm db:migrate`, cấu hình khóa server khớp nhau, deploy Worker và web. Không chạy migration trong Netlify build.

Kiểm tra: `pnpm check`, `pnpm test:activities` (Chrome + dev server), `pnpm build:netlify`. Browser smoke bắt cá bằng server thật, xác nhận peer thấy animation/effect, lưu/reload Neon, thử replay và hồ sơ khác, sau đó dọn đúng UUID QA.
