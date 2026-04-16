export const MOCK_STRATEGIES = [
    {
        id: 'strat-001', type: 'pricing', status: 'pending', confidence: 92, impact: 'high',
        title: 'Giảm giá iPhone 15 Pro Max',
        _productName: 'iPhone 15 Pro Max (256GB – Titan Đen)',
        description: 'Đối thủ "MobileWorld Market" vừa hạ giá xuống 27.490.000đ, thấp hơn ta 1.010.000đ. Để bảo vệ thị phần, AI đề xuất điều chỉnh giá về 27.790.000đ – vẫn giữ định vị Premium nhờ rating 4.9★ cao hơn đối thủ.',
        _aiReasoning: 'MobileWorld Market giảm giá 3.3% kéo thị phần Shopee. Rating của shop ta (4.9★) cao hơn đối thủ 0.4★ nên không cần giảm sâu – chỉ thu hẹp khoảng cách giá để giữ chuyển đổi. Biên lợi nhuận sau điều chỉnh vẫn đạt 8.2%, vượt ngưỡng tối thiểu 6%.',
        _contentSuggestion: 'Cập nhật thumbnail với badge "Giá tốt nhất hôm nay" và thêm highlight pin 29h vào mô tả.',
        _currentPrice: 28500000, _proposedPrice: 27790000,
    },
    {
        id: 'strat-002', type: 'pricing', status: 'approved', confidence: 78, impact: 'medium',
        title: 'Tăng giá AirPods Pro 2',
        _productName: 'Apple AirPods Pro 2 (USB-C)',
        description: 'Giá hiện tại 5.450.000đ đang thấp hơn thị trường 6%. Với rating 4.8★ và tỷ lệ chuyển đổi ổn định 4.1%, AI khuyến nghị điều chỉnh tăng về 5.690.000đ để cải thiện biên lợi nhuận.',
        _aiReasoning: 'So sánh với 3 đối thủ cùng phân khúc: giá TB thị trường 5.720.000đ. Ta đang bán rẻ hơn 6% nhưng CR không tăng tương xứng, chứng tỏ mức giá không phải rào cản chính. Tăng giá về 5.690.000đ cải thiện margin thêm 2.4% mà không ảnh hưởng đáng kể đến volume bán.',
        _contentSuggestion: 'Thêm "Chính hãng Apple – Bảo hành 12 tháng" vào tiêu đề để gia tăng trust và hỗ trợ định giá cao hơn.',
        _currentPrice: 5450000, _proposedPrice: 5690000,
    },
    {
        id: 'strat-003', type: 'pricing', status: 'pending', confidence: 85, impact: 'high',
        title: 'Flash Sale Galaxy S24 Ultra',
        _productName: 'Samsung Galaxy S24 Ultra (512GB)',
        description: 'Lượt tìm kiếm "Galaxy S24 Ultra" tăng 45% trong 48h qua. Đây là thời điểm lý tưởng để tổ chức Flash Sale 24h giảm về 27.890.000đ nhằm bắt sóng cầu và xả bớt 38 đơn vị tồn kho.',
        _aiReasoning: 'Google Trends và dữ liệu tìm kiếm nội sàn đều xác nhận đợt quan tâm tự nhiên. Tồn kho 38 units, ngày turnover hiện tại 22 ngày → Flash Sale 24h có thể đẩy nhanh xuống 8-10 ngày. Giá Flash Sale 27.890.000đ vẫn bảo vệ margin tối thiểu 7%.',
        _contentSuggestion: 'Đặt banner "Flash Sale còn 24h" + countdown timer trên ảnh bìa sản phẩm. Đẩy Shopee Ads +20% trong khung giờ vàng 20h–22h.',
        _currentPrice: 29990000, _proposedPrice: 27890000,
    },
    {
        id: 'strat-004', type: 'content', status: 'pending', confidence: 88, impact: 'medium',
        title: 'Tối ưu SEO Galaxy Buds3 Pro',
        _productName: 'Samsung Galaxy Buds3 Pro',
        description: 'Tiêu đề sản phẩm hiện thiếu các keyword có lượng tìm kiếm cao như "chống ồn", "ANC", "tai nghe không dây cao cấp". AI đề xuất viết lại tiêu đề + mô tả 300 từ để tăng khả năng hiển thị tự nhiên.',
        _aiReasoning: 'Phân tích 50 listing đối thủ top 5 Shopee cho keyword "tai nghe chống ồn": 90% đều có từ "ANC" và "chống ồn chủ động" trong tiêu đề. Listing của ta thiếu cả hai → ranking thấp dù chất lượng sản phẩm tốt. Cập nhật tiêu đề dự kiến tăng CTR từ trang kết quả tìm kiếm lên ~12%.',
        _contentSuggestion: 'Tiêu đề mới đề xuất: "Tai nghe Galaxy Buds3 Pro – Chống ồn ANC 3 lớp, Pin 30h, Kết nối đa điểm". Thêm mô tả 300 từ nhấn mạnh trải nghiệm âm thanh lossless Hi-Fi.',
    },
    {
        id: 'strat-006', type: 'chat_response', status: 'denied', confidence: 95, impact: 'high',
        title: 'Xử lý khiếu nại - KH #8842',
        _productName: 'iPhone 15 Pro Max – ĐH #8842',
        description: 'Khách hàng báo cáo sản phẩm lỗi khi nhận hàng; có video bóc hộp làm bằng chứng. AI đề xuất đổi mới + tặng Voucher 15% để giải quyết nhanh, ngăn review tiêu cực.',
        _aiReasoning: 'Đây là khiếu nại có bằng chứng video rõ ràng, khả năng cao là lỗi vận chuyển. Xử lý nhanh trong 2h có thể chuyển thành review tích cực. Tuy nhiên chủ shop đã từ chối mức Voucher 15% (quá cao) và chỉ đổi mới – quyết định này đã được ghi nhận để AI điều chỉnh chính sách đề xuất trong tương lai.',
        _contentSuggestion: 'Quy trình đổi hàng: (1) Xác nhận video; (2) Tạo đơn đổi mới miễn phí ship; (3) Cập nhật lưu ý đóng gói kép cho đơn hàng cao cấp.',
        feedback: 'Voucher 15% quá cao, chỉ đổi mới',
    },
];

export const MOCK_CHAT_SESSIONS = [
    {
        id: 'conv-1', name: 'Nguyễn Thị A', type: 'auto', status: 'replied', lastMsg: 'Sắp có hàng Shopee Mall chưa shop?',
        time: '10:05', badge: 'Tự động',
        messages: [
            { role: 'customer', text: 'Cho mình hỏi AirPods Pro 2 chừng nào có hàng lại ạ?', time: '10:04' },
            { role: 'assistant', text: 'AgiCom AI: Dạ sản phẩm AirPods Pro 2 sẽ được restock vào ngày mai (11/04) lúc 9h sáng nhé bạn. Đừng bỏ lỡ nha! 💖', time: '10:05' }
        ]
    },
    {
        id: 'conv-2', name: 'Trần Văn B', type: 'review', status: 'waiting', lastMsg: 'Mua 3 cái có bớt không?',
        time: '09:45', badge: 'Chờ duyệt',
        messages: [
            { role: 'customer', text: 'Shop ơi mình định lấy 3 cái S24 Ultra, shop có bớt không?', time: '09:44' },
            { role: 'assistant_draft', text: 'Dạ nếu bạn lấy 3 máy, shop có thể giảm trực tiếp 1 triệu/máy hoặc tặng kèm 3 tai nghe Buds FE. Bạn muốn chọn ưu đãi nào ạ?', time: '09:45' }
        ]
    },
    {
        id: 'conv-3', name: 'Lê C', type: 'escalate', status: 'action_needed', lastMsg: 'Làm ăn dối trá, hàng giả à?',
        time: '09:12', badge: 'Cần XL',
        flags: ['Toxic', 'Complain'],
        messages: [
            { role: 'customer', text: 'Shop làm ăn dối trá à? Giao iphone 15 pro max mà bên trong toàn gạch đá!', time: '09:10' },
            { role: 'customer', text: 'Tao đã quay đủ video bóc hàng, chờ tao report cho bay shop nhóc con', time: '09:12' }
        ]
    }
];
