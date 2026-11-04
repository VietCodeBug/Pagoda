# Virtual Temple Online — Game Design Document

Phiên bản thiết kế 0.1 · 04/11/2026 · Web 3D social multiplayer · PC và mobile

Tài liệu này chốt hành vi sản phẩm và tiêu chí nghiệm thu. Việc một tính năng có trong thiết kế không đồng nghĩa tính năng đã qua kiểm thử; xem `ROADMAP.md` và kết quả kiểm thử của từng lần bàn giao.

## 1. Trải nghiệm cốt lõi

Người chơi bước vào một ngôi chùa nhỏ giữa vườn cây, tự do đi dạo, dâng hương, để lại lời nguyện, thiền, rung chuông và trò chuyện. Đồ họa stylized với ánh nắng ấm, mái ngói xanh, gỗ sẫm và ánh đèn lồng. Một phiên chơi có thể kéo dài 5–15 phút mà không đặt nghĩa vụ đăng nhập hằng ngày.

Khu luyện võ cung cấp hoạt động vận động và thử animation chiến đấu. Người chơi chủ động tham gia; không thể gây sát thương trong chính điện hoặc sân chùa.

Nguyên tắc sản phẩm:

1. Mở trang là thấy thế giới game; giao diện gia nhập nằm trên khung cảnh.
2. Khách chọn tên và ngoại hình rồi vào chơi. Liên kết tài khoản là bước mở rộng.
3. Dễ điều khiển, camera rõ ràng, trạng thái tương tác có phản hồi.
4. Một phòng tối đa 20 người trong MVP; phòng tách trạng thái với nhau.
5. Chơi một mình vẫn có cảnh động, âm thanh và hoạt động.
6. Không bán quyền cầu nguyện; không thưởng điểm bằng cách spam nghi lễ.
7. Có tùy chọn tắt âm thanh, đồ họa thấp và giao diện cảm ứng.
8. Dữ liệu riêng tư chỉ công khai khi người chơi chọn.

## 2. Vòng chơi

Chọn tên/ngoại hình → chọn phòng → khám phá → tương tác hoặc giao lưu → lưu lời nguyện → quay lại khi muốn.

Vòng chơi không cần combat để hoàn thành. Khu luyện võ là nhánh tự chọn, không chặn nghi lễ hoặc mở khóa nội dung chính.

| Hoạt động | Hành vi | Phản hồi cần thấy/nghe |
| --- | --- | --- |
| Khám phá | Đi từ sân vào điện, sang vườn/hồ | Camera bám, bước đi mượt, khu vực có bản sắc |
| Dâng hương | Đến gần bàn thờ, nhấn E | Đứng đúng điểm, chắp tay, khói và ánh sáng |
| Cầu nguyện | Nhập lời nguyện, chọn riêng tư/công khai | Kết quả lưu rõ ràng, mặc định riêng tư |
| Thiền | Đến bồ đoàn và nhấn E | Tư thế ngồi; khóa di chuyển đến khi kết thúc |
| Cúi chào | Chọn hành động cúi chào | Cúi người mượt; người cùng phòng nhìn thấy |
| Rung chuông | Đến gần chuông và nhấn E | Chuông rung và âm thanh đồng bộ cùng phòng |
| Giao lưu | Chat, chào, gửi cảm xúc | Bong bóng trên avatar, nhật ký chat phòng |
| Luyện võ | Vào sân và bật tham gia | Hiện HP; đánh có hồi chiêu, trúng đòn giảm HP |

## 3. Bản đồ đầu tiên

Một bản đồ liền mạch, không tải lại khi đổi khu vực. Tọa độ dưới đây là quy ước thiết kế để các module dùng chung.

| Khu vực | Vị trí quy ước X/Z | Chức năng |
| --- | --- | --- |
| Cổng và sân | Spawn gần `(0, 16)` | Hướng dẫn ngắn, nhìn thấy chính điện ngay |
| Chính điện | Phía Bắc, Z âm | Tam tượng, bàn thờ và dâng hương |
| Bàn thờ | Gần `(0, -14)` | Điểm tương tác nghi lễ |
| Vườn thiền | Phía Tây Bắc | Bồ đoàn, cây và không gian yên tĩnh |
| Hồ sen/cá | Phía Tây | Mặt nước, cảnh quan và sinh vật |
| Chuông | Phía Đông Bắc | Tương tác âm thanh cộng đồng |
| Sân luyện võ | X từ 14 đến 24, Z từ 0 đến 12 | Vùng duy nhất cho phép PvP |

Tường, cột, hồ và bàn thờ chặn nhân vật bằng collider gần với hình dạng nhìn thấy. Đường chính không có ngõ cụt bắt buộc, khoảng trống đủ để đi qua trên mobile. Camera không lọt vào vật cản lớn hoặc tụt xuống dưới mặt đất.

## 4. Nhân vật và animation

Bốn file Meshy được cung cấp là bốn bản xuất animation của **cùng một nhân vật và cùng bộ xương**, không phải bốn nhân vật riêng. MVP tạo bốn phối màu trên model đó:

| Ngoại hình | Màu định hướng |
| --- | --- |
| An Nhiên | Cát ấm |
| Thanh Trúc | Xanh ngọc |
| Minh Nguyệt | Xanh lam nhạt |
| Hổ Phách | Cam đất |

Model gốc cao khoảng 1,7 đơn vị, 32 xương. Các clip gốc là Walk, Run, Attack và Agree. Idle dùng tư thế đứng lấy từ clip Agree; Sit, Bow và Pray dùng pose điều khiển xương trong runtime. Chúng cần được thay bằng clip diễn hoạt riêng nếu muốn chất lượng nghi lễ đạt mức phát hành thương mại.

Yêu cầu animation: crossfade khi chuyển trạng thái; không trượt khi ngồi/khấn; không dùng chung bộ xương sống giữa nhiều người chơi; không để nhân vật đứng T-pose khi mất gói mạng.

## 5. Điều khiển

| Thiết bị | Đầu vào | Kết quả |
| --- | --- | --- |
| PC | WASD hoặc phím mũi tên | Di chuyển theo hướng camera |
| PC | Shift | Chạy |
| PC | Chuột/kéo khung cảnh | Xoay góc nhìn thứ ba |
| PC | E | Thực hiện tương tác gần nhất |
| PC | Enter | Mở hoặc gửi chat |
| PC | Nút đánh/phím được hiện trên HUD | Đánh trong sân luyện võ khi đã tham gia |
| Mobile | Joystick trái | Di chuyển |
| Mobile | Vuốt phía phải | Xoay camera |
| Mobile | Nút tương tác/đánh | Thực hiện hành động tương ứng |

Tên phím cuối cùng theo HUD và README của bản chạy. Khi gõ vào input, phím điều khiển không tác động lên nhân vật. Khi nghi lễ đang chạy, input di chuyển bị khóa; UI phải cho biết cách kết thúc. Khi thoát tab/mất focus, trạng thái phím được xóa để không tự chạy.

Click-to-move trong bản hiện tại dùng A* trên lưới, tránh hồ, tường và cột. Người chơi bật tùy chọn trong Cài đặt; WASD hủy đường đi tự động. Navmesh chi tiết cho bản đồ lớn là hạng mục mở rộng.

## 6. Multiplayer và giao tiếp

Phòng MVP có 20 chỗ; tối thiểu ba ID phòng cấu hình sẵn. Cùng phòng thấy người chơi di chuyển, đổi pose, chat, emote và tương tác. Khác phòng không nhận trạng thái của nhau.

Client cập nhật hình ảnh theo frame render; gửi vị trí khoảng 10 lần/giây khi cần. Người chơi từ xa được nội suy tới trạng thái mới. Trạng thái online phải phân biệt: đang kết nối, đã vào phòng, mất kết nối và chơi cục bộ. Không dùng NPC hoặc avatar minh họa để tính số người online.

Chat giới hạn độ dài và tần suất ở server, hiển thị dưới dạng văn bản. Bong bóng gần avatar tồn tại ngắn; chat toàn phòng có nhật ký giới hạn. Chat theo khoảng cách đầy đủ, báo cáo người chơi và kiểm duyệt có người vận hành là các hạng mục tiếp theo.

## 7. Nghi lễ và lời nguyện

Người chơi phải tới gần điểm dâng hương/chuông để hành động có hiệu lực. Server kiểm tra khoảng cách, thời gian khóa hành động và hồi chiêu. Một sự kiện nhỏ được phát tới cả phòng; từng trình duyệt tự dựng khói, ánh sáng và âm thanh.

Lời nguyện dài tối đa 500 ký tự, mặc định riêng tư. Bảng cộng đồng chỉ trả về lời nguyện công khai; không lộ ID nội bộ của người viết. Mỗi người chỉ gửi một lời nguyện trong ít nhất 30 giây. Gửi lại sau lỗi mạng phải có phản hồi rõ ràng.

Không xây bảng xếp hạng “được cầu nguyện nhiều nhất”. Công đức, thành tựu và vật phẩm có thể bổ sung sau khi chốt quy tắc chống lạm dụng; client không tự cấp thưởng.

## 8. Luyện võ

Chỉ người **đã bật tham gia** và đang đứng trong sân luyện võ mới có thể tấn công hoặc nhận sát thương. Ra khỏi sân hủy trạng thái chiến đấu.

| Tham số MVP | Giá trị |
| --- | --- |
| HP tối đa | 100 |
| Sát thương một đòn | 14 |
| Tầm đánh | 2,4 đơn vị |
| Hồi chiêu | 700 ms |
| Hồi sinh sau hạ gục | 5 giây |

Server quyết định đòn đánh hợp lệ và HP. Client chỉ yêu cầu đánh và phát animation. HP dưới 0 không được ghi nhận; không đánh tiếp người đã bị hạ gục. Không có vũ khí, máu me, vật phẩm trả phí hoặc điểm nghi lễ gắn với thắng PvP trong MVP.

## 9. Hình ảnh và âm thanh

Ba mức Low/Medium/High thay đổi độ phân giải render, bóng và số particle. Ánh nắng ấm, sương xa và chuyển động nhỏ tạo chiều sâu. Ban đêm dùng đèn lồng và ánh sáng bàn thờ; không thêm hàng chục đèn đổ bóng realtime.

Nhạc nền lấy từ file người dùng cung cấp. Chỉ phát sau một tương tác của người dùng, có nút mute rõ ràng. Tiếng chuông có thể tổng hợp qua Web Audio trong bản đầu. Audio không được chặn việc vào chơi nếu trình duyệt không cho phát.

Không coi asset do người dùng cung cấp là đã có giấy phép phân phối công khai; cần xác nhận quyền trước khi phát hành ra công chúng.

## 10. Tiêu chí nghiệm thu sản phẩm

- Gia nhập bằng tên và ngoại hình, không phải đăng ký tài khoản.
- Đi từ sân vào điện và quanh hồ; không xuyên vật cản; camera giữ được người chơi.
- PC và cảm ứng đều di chuyển, xoay camera và tương tác được.
- Avatar đổi Walk/Run/Idle mượt; Sit/Bow/Pray phân biệt được.
- Hai trình duyệt cùng phòng nhìn thấy nhau, chat, emote, chuông và hương.
- Hai người khác phòng không thấy sự kiện của nhau; người thứ 21 nhận báo phòng đầy.
- Dâng hương và thiền khóa di chuyển đúng thời gian.
- Lời nguyện riêng tư không xuất hiện trên API/bảng công khai.
- Chỉ đánh được khi cả hai tham gia trong sân; HP do server quyết định.
- Đổi chất lượng/mute hoạt động; loading và lỗi kết nối có phản hồi.

Mục tiêu hiệu năng là khoảng 60 FPS trên desktop tầm trung và 30 FPS trên mobile tầm trung. Đây là **mục tiêu cần đo trên thiết bị thật**, không phải kết quả đã xác minh.
