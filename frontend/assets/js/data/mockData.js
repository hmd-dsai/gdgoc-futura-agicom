export const MOCK_STRATEGIES = [
    { id: 'strat-001', type: 'pricing', title: 'Giảm giá iPhone 15 Pro Max', description: 'Đối thủ "MobileWorld Market" phá giá. Đề xuất: 27.790.000₫.', confidence: 92, impact: 'high', status: 'pending' },
    { id: 'strat-002', type: 'pricing', title: 'Tăng giá AirPods Pro 2', description: 'Đang bán thấp hơn TT 6%. Đề xuất: 5.690.000₫.', confidence: 78, impact: 'medium', status: 'approved' },
    { id: 'strat-003', type: 'pricing', title: 'Flash Sale Galaxy S24 Ultra', description: 'Trend search tăng 45%. Đề xuất Flash Sale 24h: 27.890.000₫.', confidence: 85, impact: 'high', status: 'pending' },
    { id: 'strat-004', type: 'content', title: 'Tối ưu SEO Buds3 Pro', description: 'Thiếu keyword "chống ồn". Đề xuất tiêu đề mới + mô tả 300 từ.', confidence: 88, impact: 'medium', status: 'pending' },
    { id: 'strat-006', type: 'chat_response', title: 'Xử lý khiếu nại - KH #8842', description: 'Hàng lỗi. Đề xuất: Đổi mới + Voucher 15%.', confidence: 95, impact: 'high', status: 'denied', feedback: 'Voucher 15% quá cao, chỉ đổi mới' }
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
