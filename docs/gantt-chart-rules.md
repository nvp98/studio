# Tài liệu Quy tắc Hiển thị Biểu đồ Gantt

Tài liệu này mô tả các quy tắc và logic cốt lõi điều khiển việc phân tích, xác thực và hiển thị dữ liệu trên biểu đồ Gantt của ứng dụng HRC1.LT.

## 1. Phân tích & Xác thực Dữ liệu (`src/lib/excel-parser.ts`, `src/lib/validator.ts`)

### 1.1. Dữ liệu đầu vào

-   **Nguồn**: Tệp Excel (`.xlsx`, `.xls`, `.csv`).
-   **Yêu cầu cột**: Hệ thống sẽ chuẩn hóa tiêu đề cột (xóa dấu, khoảng trắng, ký tự đặc biệt) và ánh xạ chúng vào các trường dữ liệu nội bộ. Các cột bắt buộc bao gồm:
    -   `Heat_ID`: Mã mẻ thép.
    -   `Steel_Grade`: Mác thép.
    -   `Unit`: Tên công đoạn/thiết bị (ví dụ: `KR1`, `BOF2`, `TSC1`).
    -   `Start_Time`: Thời gian bắt đầu công đoạn.
    -   `End_Time`: Thời gian kết thúc công đoạn.
    -   `Date` (tùy chọn): Ngày sản xuất, dùng làm tham chiếu nếu có.
    -   `sequence_number` (tùy chọn): Thứ tự công đoạn, dùng để sắp xếp nếu có.

### 1.2. Quy tắc Xác thực & Chuyển đổi

1.  **Xác thực Thiết bị (`Unit`)**: Chỉ các `Unit` được định nghĩa trong hằng số `UNIT_SEQUENCE` mới được coi là hợp lệ. Các `Unit` không xác định sẽ bị báo lỗi dạng cảnh báo (`warning`).

2.  **Xử lý Thời gian**:
    -   Hệ thống có khả năng xử lý thời gian qua đêm. Nếu thời gian kết thúc sớm hơn thời gian bắt đầu (ví dụ: bắt đầu `23:00`, kết thúc `01:00`), hệ thống sẽ tự động hiểu thời gian kết thúc thuộc về ngày hôm sau.
    -   Nếu một công đoạn bắt đầu sớm hơn thời điểm kết thúc của công đoạn *trước đó trong cùng một mẻ thép*, hệ thống sẽ cho phép sự chồng lấn này diễn ra trên biểu đồ.

3.  **Xác định "Ngày Sản xuất"**:
    -   Để tính toán thứ tự mẻ trong ngày (`sequenceInCaster`), một "ngày sản xuất" được định nghĩa là khoảng thời gian **từ 08:00 sáng hôm nay đến 07:59 sáng hôm sau**.
    -   Thứ tự của một mẻ được xác định dựa trên thời gian bắt đầu của công đoạn đúc (Caster) trong "ngày sản xuất" đó.

4.  **Tính toán Thứ tự (`sequenceInCaster`)**:
    -   Hệ thống sẽ nhóm tất cả các mẻ hợp lệ theo `castingMachine` (máy đúc cuối cùng) và theo "ngày sản xuất".
    -   Trong mỗi nhóm, các mẻ sẽ được sắp xếp theo thời gian bắt đầu tại máy đúc.
    -   Thứ tự (`sequenceInCaster`) được gán từ 1 trở đi cho mỗi mẻ trong nhóm đã sắp xếp.

## 2. Quy tắc Trực quan hóa Biểu đồ (`src/components/gantt-chart.tsx`)

### 2.1. Bố cục (Layout)

-   **Trục Y (Hàng)**: Các hàng được sắp xếp theo một thứ tự cố định và được nhóm trực quan, định nghĩa trong hằng số `UNIT_ORDER`.
-   **Trục X (Thời gian)**: Hiển thị dòng thời gian, với các đường kẻ lưới mờ (`grid lines`) được vẽ mỗi 30 phút để dễ dàng tham chiếu.
-   **Kích thước**: Mỗi khối công việc có chiều cao cố định (`barHeight` ~28px) và khoảng cách (`barPadding` ~8px) để đảm bảo dễ đọc ngay cả khi mật độ dữ liệu cao.

### 2.2. Màu sắc (Color Logic)

1.  **Màu Cơ bản**: Màu sắc của tất cả các công đoạn trong cùng một mẻ thép (`Heat_ID`) được quyết định bởi **máy đúc cuối cùng** (`castingMachine`) mà mẻ đó đi qua.
2.  **Bảng màu Cố định**: Màu sắc là cố định và không thay đổi độ đậm/nhạt theo thứ tự.
    -   `TSC1`: **#41A67E** (Xanh lục)
    -   `TSC2`: **#05339C** (Xanh dương đậm)
    -   `BCM1`: **#43A047** (Xanh lá cây)
    -   `BCM2`: **#FB8C00** (Cam)
    -   `BCM3`: **#E53935** (Đỏ)
3.  **Màu Chữ Tự động**: Màu chữ trên mỗi khối được tự động chọn là màu đen (`#0A0A0A`) hoặc trắng (`#FFFFFF`) để đảm bảo độ tương phản tốt nhất với màu nền.

### 2.3. Nhãn hiển thị (Labels)

-   **Công đoạn Đúc (Caster - TSC/BCM)**: Nhãn hiển thị đầy đủ thông tin: `Heat_ID (#sequence)`.
    -   Ví dụ: `D7090 (5)`
-   **Các công đoạn khác (KR, BOF, LF)**: Nhãn chỉ hiển thị `Heat_ID` để giảm sự lộn xộn về thông tin.
    -   Ví dụ: `D7090`
-   Kích thước font chữ của `Heat_ID` và `(#sequence)` là như nhau để đảm bảo tính nhất quán.

### 2.4. Xử lý Chồng lấn (Overlap Handling)

-   Khi hai hoặc nhiều khối công việc bị chồng lấn trên cùng một hàng, khối nào có **thời gian bắt đầu sớm nhất sẽ được ưu tiên hiển thị ở lớp trên cùng**.
-   Logic này được thực hiện bằng cách sắp xếp dữ liệu trước khi vẽ: các công việc bắt đầu muộn hơn sẽ được vẽ trước, và các công việc bắt đầu sớm hơn sẽ được vẽ sau cùng (đè lên trên).

### 2.5. Đường nối (Lineage Lines)

-   Các đường nối mờ, đứt nét sẽ được hiển thị **mặc định** để kết nối các công đoạn của cùng một mẻ thép, giúp trực quan hóa luồng sản xuất.
-   Opacity mặc định của các đường này là `0.3` (30%).

## 3. Quy tắc Tương tác Người dùng (`src/components/gantt-chart.tsx`)

1.  **Di chuột (Hover) hoặc Nhấp chuột (Click) vào một khối**:
    -   Tất cả các khối công việc thuộc cùng `Heat_ID` đó sẽ được **làm nổi bật** (giữ nguyên opacity là 1).
    -   Tất cả các khối công việc khác không liên quan sẽ được **làm mờ** (giảm opacity xuống 40-50%).
    -   Đường nối (`lineage lines`) của mẻ thép được chọn sẽ trở nên **đậm hơn** (opacity tăng lên `0.9` và `stroke-width` tăng lên `2`).

2.  **Bỏ chọn**:
    -   Nhấp chuột vào vùng trống trên biểu đồ sẽ bỏ chọn mẻ thép hiện tại.
    -   Tất cả các khối và đường nối sẽ quay trở lại trạng thái hiển thị mặc định.

3.  **Tooltip**:
    -   Khi di chuột qua một khối công việc, một tooltip sẽ xuất hiện hiển thị thông tin chi tiết:
        -   Mã mẻ (`Heat_ID`) và thứ tự (`#sequence`).
        -   Thiết bị (`Unit`).
        -   Thời gian bắt đầu và kết thúc.
        -   Thời lượng xử lý (phút).
