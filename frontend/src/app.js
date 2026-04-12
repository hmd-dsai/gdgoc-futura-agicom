const MOCK_STRATEGIES = [
  {
    id: 'str-001',
    type: 'pricing',
    status: 'pending',
    title: 'Giảm giá 5% cho Ốp lưng iPhone 15',
    description: 'Đối thủ chính vừa giảm giá. Dự kiến tăng 15% tỷ lệ chuyển đổi nếu áp dụng ngay.',
    confidence: 92,
    impact: 'high',
    current_value: '150.000₫',
    suggested_value: '142.000₫'
  },
  {
    id: 'str-002',
    type: 'content',
    status: 'approved',
    title: 'Thêm keyword "Chống ố vàng" vào tên SP',
    description: 'Từ khóa đang trending trên Shopee tuần này.',
    confidence: 88,
    impact: 'medium',
    current_value: 'Ốp lưng trong suốt',
    suggested_value: 'Ốp lưng trong suốt chống ố vàng'
  }
];

let appState = {
  currentPage: 'dashboard',
  strategies: JSON.parse(JSON.stringify(MOCK_STRATEGIES)),
  aiLearned: 142
};

function getConfLevel(conf) {
  if (conf >= 80) return 'high';
  if (conf >= 50) return 'medium';
  return 'low';
}

function showToast(type, message) {
  const container = document.getElementById('toastContainer');
  if (!container) return;
  const d = document.createElement('div');
  d.className = 'toast ' + type;
  const icon = type === 'success' ? '✅' : type === 'error' ? '❌' : 'ℹ️';
  d.innerHTML = `<div class="toast-icon">${icon}</div><div class="toast-message">${message}</div>`;
  container.appendChild(d);
  setTimeout(() => { d.classList.add('removing'); setTimeout(() => d.remove(), 300); }, 3000);
}

function renderStrategyCardHTML(strategy) {
  const isP = strategy.status === 'pending';
  const typeMap = { pricing: '💰 Cạnh Tranh Giá', content: '✍️ Tối Ưu Nội Dung', chat_response: '💬 Chat Tự Động' };

  return `
    <div class="strategy-card">
      <div class="strategy-card-top">
        <div class="strategy-card-info">
          <div class="strategy-type-badge ${strategy.type}">${typeMap[strategy.type] || 'Chiến lược mới'}</div>
          <h4 class="strategy-title">${strategy.title}</h4>
          <p class="strategy-description">${strategy.description}</p>
        </div>
        <div class="strategy-meta">
          ${isP ? '<span class="status-badge pending"><span class="status-dot"></span> Chờ duyệt</span>'
      : strategy.status === 'approved' ? '<span class="status-badge approved"><span class="status-dot"></span> Đã duyệt</span>'
        : '<span class="status-badge denied"><span class="status-dot"></span> Đã hủy</span>'}
        </div>
      </div>
      
      ${strategy.current_value ? `
        <div class="strategy-comparison">
          <div class="comparison-box"><div class="comparison-label">Hiện tại</div><div class="comparison-value">${strategy.current_value}</div></div>
          <div class="comparison-arrow">➔</div>
          <div class="comparison-box"><div class="comparison-label">Đề xuất (AI)</div><div class="comparison-value new">${strategy.suggested_value}</div></div>
        </div>
      ` : ''}
      
      <div class="confidence-bar">
        <span class="confidence-label">Độ tin cậy AI:</span>
        <div class="confidence-track"><div class="confidence-fill ${getConfLevel(strategy.confidence)}" style="width:${strategy.confidence}%"></div></div>
        <span class="confidence-value ${getConfLevel(strategy.confidence)}">${strategy.confidence}%</span>
      </div>

      <button class="reasoning-toggle" onclick="this.nextElementSibling.classList.toggle('open'); this.querySelector('.reasoning-toggle-icon').classList.toggle('open')">
        🔍 Giải thích Lý do (AI) <span class="reasoning-toggle-icon">▼</span>
      </button>
      <div class="reasoning-content">
        <div class="reasoning-text">
          <div class="ai-label">✨ Thực thi chiến lược do Giám đốc ủy quyền:</div>
          Hệ thống phát hiện biến động chỉ số dựa trên dữ liệu mua sắm theo yêu cầu của bạn. Đề xuất này đã được cân nhắc rủi ro và các kịch bản lợi nhuận tối ưu.
        </div>
      </div>
      
      ${isP ? `
        <div class="strategy-actions">
          <button class="btn btn-accept" onclick="showToast('success', 'Đã duyệt chiến lược!'); this.parentElement.innerHTML='<b>Đã áp dụng hệ thống</b>';">
            ✅ Duyệt & Đồng bộ ngay
          </button>
          <button class="btn btn-deny" onclick="showToast('error', 'Đã từ chối đề xuất.'); this.parentElement.innerHTML='<b>Đã từ chối</b>';">
            ❌ Bỏ qua
          </button>
        </div>
      ` : ''}
    </div>
  `;
}

function renderDashboardHTML() {
  return `
    <!-- BỘ LỌC TOÀN CỤC -->
    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
      <div class="filter-tabs" style="border-bottom:none">
        <button class="filter-tab active" style="margin-left:0">Tất cả sàn</button>
        <button class="filter-tab">Shopee</button>
        <button class="filter-tab">Tiki</button>
        <button class="filter-tab">Website</button>
      </div>
      <div class="filter-tabs" style="border-bottom:none">
        <button class="filter-tab">Hôm nay</button>
        <button class="filter-tab active">7 Ngày qua</button>
        <button class="filter-tab">30 Ngày qua</button>
      </div>
    </div>

    <!-- HÀNG CHỈ SỐ -->
    <div class="stats-grid">
      <div class="stat-card indigo">
        <div class="stat-card-header" style="display:flex; justify-content:space-between; align-items:flex-start">
          <div class="stat-card-label">Doanh thu</div>
          <div style="background:var(--accent-indigo-bg); color:var(--accent-indigo); width:32px; height:32px; border-radius:8px; display:flex; align-items:center; justify-content:center; font-size:1.1rem">💰</div>
        </div>
        <div class="stat-card-value" style="font-size:1.8rem; margin:8px 0; font-weight:800; line-height:1">120.5<span style="font-size:1rem; color:var(--text-muted)">M₫</span></div>
        <div class="stat-card-trend" style="color:var(--accent-emerald); font-size:0.8rem; font-weight:600">↑ 15% vs kỳ trước</div>
      </div>
      
      <div class="stat-card emerald">
        <div class="stat-card-header" style="display:flex; justify-content:space-between; align-items:flex-start">
          <div class="stat-card-label">Tổng Đơn Hàng</div>
          <div style="background:var(--accent-emerald-bg); color:var(--accent-emerald); width:32px; height:32px; border-radius:8px; display:flex; align-items:center; justify-content:center; font-size:1.1rem">📦</div>
        </div>
        <div class="stat-card-value" style="font-size:1.8rem; margin:8px 0; font-weight:800; line-height:1">450</div>
        <div class="stat-card-trend" style="color:var(--accent-emerald); font-size:0.8rem; font-weight:600">↑ 5% vs kỳ trước</div>
      </div>
      
      <div class="stat-card rose">
        <div class="stat-card-header" style="display:flex; justify-content:space-between; align-items:flex-start">
          <div class="stat-card-label">Tỷ Lệ Chuyển Đổi (CR)</div>
          <div style="background:var(--accent-rose-bg); color:var(--accent-rose); width:32px; height:32px; border-radius:8px; display:flex; align-items:center; justify-content:center; font-size:1.1rem">🎯</div>
        </div>
        <div class="stat-card-value" style="font-size:1.8rem; margin:8px 0; font-weight:800; line-height:1">3.2<span style="font-size:1rem; color:var(--text-muted)">%</span></div>
        <div class="stat-card-trend" style="color:var(--accent-rose); font-size:0.8rem; font-weight:600">↓ 0.5% vs kỳ trước</div>
      </div>
      
      <div class="stat-card amber">
        <div class="stat-card-header" style="display:flex; justify-content:space-between; align-items:flex-start">
          <div class="stat-card-label">AOV (Giỏ hàng)</div>
          <div style="background:var(--accent-amber-bg); color:var(--accent-amber); width:32px; height:32px; border-radius:8px; display:flex; align-items:center; justify-content:center; font-size:1.1rem">🛒</div>
        </div>
        <div class="stat-card-value" style="font-size:1.8rem; margin:8px 0; font-weight:800; line-height:1">266<span style="font-size:1rem; color:var(--text-muted)">K</span></div>
        <div class="stat-card-trend" style="color:var(--accent-emerald); font-size:0.8rem; font-weight:600">↑ 2% vs kỳ trước</div>
      </div>
    </div>

    <!-- CHARTS BIỂU ĐỒ -->
    <div class="grid-3" style="margin-top:24px;">
      <div class="content-card">
         <h3 class="content-card-title">Cơ Cấu Doanh Thu</h3>
         <div class="donut-chart" style="width: 160px; height: 160px; border-radius: 50%; background: conic-gradient(var(--accent-emerald) 0% 65%, var(--accent-blue) 65% 85%, var(--accent-amber) 85% 100%); position: relative; margin: 20px auto;">
           <div class="donut-center" style="position: absolute; inset: 20px; background: var(--bg-card); border-radius: 50%; display: flex; flex-direction: column; align-items: center; justify-content: center; box-shadow: inset 0 2px 4px rgba(0,0,0,0.05);">
             <div style="font-size:1.5rem; font-weight:bold; color:var(--text-heading)">3</div>
             <div style="font-size:0.75rem; color:var(--text-muted)">Nền tảng</div>
           </div>
         </div>
         <div style="display:flex; flex-direction:column; gap:8px; margin-top:20px;">
           <div style="display:flex; align-items:center; font-size:0.85rem;"><div style="width:10px; height:10px; border-radius:50%; background:var(--accent-emerald); margin-right:8px;"></div> <span style="flex:1">Shopee</span> <b>65%</b></div>
           <div style="display:flex; align-items:center; font-size:0.85rem;"><div style="width:10px; height:10px; border-radius:50%; background:var(--accent-blue); margin-right:8px;"></div> <span style="flex:1">Website</span> <b>20%</b></div>
           <div style="display:flex; align-items:center; font-size:0.85rem;"><div style="width:10px; height:10px; border-radius:50%; background:var(--accent-amber); margin-right:8px;"></div> <span style="flex:1">Tiki</span> <b>15%</b></div>
         </div>
      </div>
      
      <div class="content-card" style="grid-column: span 2">
         <h3 class="content-card-title">Doanh Thu vs Mục Tiêu (Tháng này)</h3>
         <div class="h-bars" style="margin-top:20px;">
            <div class="h-bar-item" style="margin-bottom:16px;">
              <div class="h-bar-label" style="min-width:100px; font-weight:600">Shopee</div>
              <div class="h-bar-track" style="flex:1; height:24px; background:var(--bg-glass); border-radius:12px; overflow:hidden; position:relative;">
                <div style="position:absolute; top:0; left:0; height:100%; width: 85%; background: linear-gradient(90deg, #10b981, #34d399); border-radius:12px;"></div>
                <div style="position:absolute; top:0; bottom:0; left: 90%; border-left:2px dashed #000; z-index:2"></div>
              </div>
              <div class="h-bar-value" style="font-weight:700">85%</div>
            </div>
            <div class="h-bar-item" style="margin-bottom:16px;">
              <div class="h-bar-label" style="min-width:100px; font-weight:600">Website</div>
              <div class="h-bar-track" style="flex:1; height:24px; background:var(--bg-glass); border-radius:12px; overflow:hidden; position:relative;">
                <div style="position:absolute; top:0; left:0; height:100%; width: 45%; background: linear-gradient(90deg, #0ea5e9, #38bdf8); border-radius:12px;"></div>
                <div style="position:absolute; top:0; bottom:0; left: 50%; border-left:2px dashed #000; z-index:2"></div>
              </div>
              <div class="h-bar-value" style="font-weight:700">45%</div>
            </div>
            <div class="h-bar-item" style="margin-bottom:16px;">
              <div class="h-bar-label" style="min-width:100px; font-weight:600">Tiki</div>
              <div class="h-bar-track" style="flex:1; height:24px; background:var(--bg-glass); border-radius:12px; overflow:hidden; position:relative;">
                <div style="position:absolute; top:0; left:0; height:100%; width: 60%; background: linear-gradient(90deg, #f59e0b, #fbbf24); border-radius:12px;"></div>
                <div style="position:absolute; top:0; bottom:0; left: 80%; border-left:2px dashed #000; z-index:2"></div>
              </div>
              <div class="h-bar-value" style="font-weight:700">60%</div>
            </div>
         </div>
         <div style="font-size:0.8rem; color:var(--text-muted); margin-top:20px; display:flex; align-items:center; gap:8px;">
            <div style="border-left:2px dashed #000; height:16px;"></div> Dấu gạch nét đứt là Target doanh thu đặt ra đầu tháng
         </div>
      </div>
    </div>

    <!-- INSIGHT CARD -->
    <div class="content-card" style="border-left: 4px solid var(--accent-indigo); background: rgba(234, 179, 8, 0.05); margin-top: 24px;">
      <div style="display:flex; gap:12px; align-items:flex-start;">
        <div style="font-size:2.5rem; line-height:1">💡</div>
        <div>
          <h4 style="font-size:1rem; font-weight:700; color:var(--text-heading); margin-bottom:8px;">AgiCom Insight (Phân tích chuyên sâu)</h4>
          <p style="font-size:0.9rem; color:var(--text-secondary); line-height:1.6; margin:0">
            Doanh thu đang tập trung mạnh vào sàn <b>Shopee (65%)</b> với sản phẩm chủ lực là "Tai nghe Bluetooth". 
            Tuy nhiên, tỷ lệ chuyển đổi (CR) đang có dấu hiệu giảm nhẹ.<br/>
            👉 <b>Đề xuất chiến lược:</b> Tăng 15% ngân sách quảng cáo nội sàn Shopee cho Top 3 SKU. Set thêm Flash Sale khung giờ vàng cuối tuần này để kéo lại CR và tận dụng sức mua đầu tháng.
          </p>
        </div>
      </div>
    </div>

    <!-- DATA TABLES -->
    <div class="grid-2" style="margin-top:24px;">
      <div class="content-card" style="overflow-x:auto;">
        <h3 class="content-card-title">Mức độ Tăng Trưởng Theo Ngành Hàng</h3>
        <table class="data-table" style="width:100%; border-collapse:collapse; text-align:left; font-size:0.85rem;">
          <thead>
            <tr style="border-bottom:1px solid var(--border-primary); color:var(--text-muted);">
              <th style="padding:12px 8px;">Ngành Hàng</th>
              <th style="padding:12px 8px;">Tổng Doanh thu</th>
              <th style="padding:12px 8px;">Tỷ Trọng</th>
              <th style="padding:12px 8px; text-align:right">Tăng trưởng</th>
            </tr>
          </thead>
          <tbody>
            <tr style="border-bottom:1px solid var(--border-primary);">
              <td style="padding:12px 8px; font-weight:600;">Audio & Tai nghe</td>
              <td style="padding:12px 8px;">54.2M</td>
              <td style="padding:12px 8px;">45%</td>
              <td style="padding:12px 8px; text-align:right; color:var(--accent-emerald); font-weight:600">+12.4%</td>
            </tr>
            <tr style="border-bottom:1px solid var(--border-primary);">
              <td style="padding:12px 8px; font-weight:600;">Phụ kiện KTS</td>
              <td style="padding:12px 8px;">42.1M</td>
              <td style="padding:12px 8px;">35%</td>
              <td style="padding:12px 8px; text-align:right; color:var(--accent-emerald); font-weight:600">+5.1%</td>
            </tr>
            <tr>
              <td style="padding:12px 8px; font-weight:600;">Đồ Bếp & Gia Dụng</td>
              <td style="padding:12px 8px;">24.2M</td>
              <td style="padding:12px 8px;">20%</td>
              <td style="padding:12px 8px; text-align:right; color:var(--accent-rose); font-weight:600">-2.0%</td>
            </tr>
          </tbody>
        </table>
      </div>
      <div class="content-card" style="overflow-x:auto;">
        <h3 class="content-card-title">Top 5 SKU Mang Lại Doanh Thu Cao Nhất</h3>
        <table class="data-table" style="width:100%; border-collapse:collapse; text-align:left; font-size:0.85rem;">
          <thead>
            <tr style="border-bottom:1px solid var(--border-primary); color:var(--text-muted);">
              <th style="padding:12px 8px;">Tên Sản Phẩm</th>
              <th style="padding:12px 8px;">Đã Bán</th>
              <th style="padding:12px 8px; text-align:right">Doanh Thu</th>
            </tr>
          </thead>
          <tbody>
            <tr style="border-bottom:1px solid var(--border-primary);">
              <td style="padding:12px 8px; font-weight:600;">Tai nghe AirPods Pro Hổ vằn 1562AE</td>
              <td style="padding:12px 8px;">152</td>
              <td style="padding:12px 8px; text-align:right; color:var(--text-heading); font-weight:700">45.6M</td>
            </tr>
            <tr style="border-bottom:1px solid var(--border-primary);">
              <td style="padding:12px 8px; font-weight:600;">Ốp lưng trong suốt Magsafe iPhone 15</td>
              <td style="padding:12px 8px;">204</td>
              <td style="padding:12px 8px; text-align:right; color:var(--text-heading); font-weight:700">20.4M</td>
            </tr>
            <tr style="border-bottom:1px solid var(--border-primary);">
              <td style="padding:12px 8px; font-weight:600;">Sạc nhanh 20W PD Anker</td>
              <td style="padding:12px 8px;">89</td>
              <td style="padding:12px 8px; text-align:right; color:var(--text-heading); font-weight:700">13.3M</td>
            </tr>
            <tr style="border-bottom:1px solid var(--border-primary);">
              <td style="padding:12px 8px; font-weight:600;">Kính cường lực Kingkong tự dán</td>
              <td style="padding:12px 8px;">120</td>
              <td style="padding:12px 8px; text-align:right; color:var(--text-heading); font-weight:700">6.0M</td>
            </tr>
            <tr>
              <td style="padding:12px 8px; font-weight:600;">Loa Bluetooth Mini Marshall giả cổ</td>
              <td style="padding:12px 8px;">45</td>
              <td style="padding:12px 8px; text-align:right; color:var(--text-heading); font-weight:700">5.8M</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- DANH SÁCH CHIẾN LƯỢC -->
    <div class="dashboard-grid" style="margin-top:24px">
      <div class="strategy-list">
        <div class="section-header">
          <div><h2 class="section-title">Danh sách Khuyến nghị / Chiến lược</h2><p class="section-subtitle">Đề xuất tự động từ AI Agent</p></div>
        </div>
        ${appState.strategies.map(s => renderStrategyCardHTML(s)).join('')}
      </div>
    </div>
  `;
}

// Placeholder cho các component khác
function renderRevenueHTML() {
  return `
    <div class="stats-grid" style="margin-bottom: 24px">
      <div class="stat-card"><div class="stat-card-label">Lợi nhuận gộp</div><div class="stat-card-value">42.5M₫</div><div class="stat-card-trend up">↑ 5.2%</div></div>
      <div class="stat-card"><div class="stat-card-label">Chi phí Vận hành</div><div class="stat-card-value">18.2M₫</div><div class="stat-card-trend down">↓ 2.1%</div></div>
      <div class="stat-card rose"><div class="stat-card-label">Tỷ suất LN (NPM)</div><div class="stat-card-value">35.2%</div><div class="stat-card-trend up">↑ 1.1%</div></div>
      <div class="stat-card amber"><div class="stat-card-label">ROAS Quảng cáo</div><div class="stat-card-value">4.8x</div><div class="stat-card-trend up">↑ 0.5x</div></div>
    </div>
    <div class="grid-2">
      <div class="content-card">
        <h3 class="content-card-title">Chi Tiết Chi Phí (Cost Breakdown)</h3>
        <table class="data-table" style="width:100%">
          <thead><tr><th>Khoản Mục</th><th>Chi Phí (₫)</th><th>% Tổng phí</th></tr></thead>
          <tbody>
            <tr><td>Quảng cáo (Shopee/TikTok)</td><td>8,450,000</td><td>46.4%</td></tr>
            <tr><td>Chi phí Cố định (Mặt bằng/Lương)</td><td>5,200,000</td><td>28.5%</td></tr>
            <tr><td>Bao bì & Vận chuyển Logistics</td><td>2,800,000</td><td>15.3%</td></tr>
            <tr><td>Chiết khấu MGG/Affiliate</td><td>1,750,000</td><td>9.8%</td></tr>
          </tbody>
        </table>
      </div>
      <div class="content-card">
        <h3 class="content-card-title">Thất thoát & Cảnh báo Chi phí</h3>
        <div class="strategy-comparison" style="margin-top:20px;">
           <div style="font-size: 0.9rem; color: var(--accent-rose); font-weight:600">⚠️ Phí Quảng Cáo TikTok Shop đang tăng vọt vượt ROAS!</div>
           <p style="font-size: 0.8rem; margin-top:8px;">Hệ thống phát hiện chiến dịch 'Bao da S24' trên TikTok đang tiêu tốn ngân sách nhưng CR chỉ đạt 0.5%.</p>
           <button class="btn btn-accept" style="margin-top:12px; font-size:0.8rem; padding: 6px 12px">Tạm dừng Campaign Tự động</button>
        </div>
      </div>
    </div>
  `;
}
function renderInventoryHTML() {
  return `
    <div class="stats-grid" style="margin-bottom: 24px">
      <div class="stat-card"><div class="stat-card-label">Tổng Kho (SKU)</div><div class="stat-card-value">2,450</div></div>
      <div class="stat-card"><div class="stat-card-label">Giá Trị Kho</div><div class="stat-card-value">1.8B₫</div></div>
      <div class="stat-card amber"><div class="stat-card-label">Sắp Hết Cần Nhập</div><div class="stat-card-value">5 SKU</div></div>
      <div class="stat-card rose"><div class="stat-card-label">Tồn Trọng (Cần xả)</div><div class="stat-card-value">12 SKU</div></div>
    </div>
    
    <div class="grid-2">
      <div class="content-card">
        <h3 class="content-card-title">Cảnh Báo Sắp Hết Hàng (Out of Stock)</h3>
        <table class="data-table" style="width:100%">
          <thead><tr><th>Sản Phẩm</th><th>Kho Còn</th><th>Tốc độ bán</th></tr></thead>
          <tbody>
            <tr><td>Trạm sạc dự phòng 100W</td><td class="value-negative">2</td><td>3 ngày cạn</td></tr>
            <tr><td>Cáp Anker bọc dù 2m</td><td class="value-negative">5</td><td>4 ngày cạn</td></tr>
            <tr><td>Củ sạc Ugreen 65W</td><td class="value-warning">8</td><td>7 ngày cạn</td></tr>
          </tbody>
        </table>
        <div style="margin-top:16px"><button class="btn btn-accept" style="font-size:0.75rem; padding:6px 12px">🚀 Lên kế hoạch nhập hàng</button></div>
      </div>
      
      <div class="content-card">
        <h3 class="content-card-title">Cảnh Báo Tồn Đọng (Slow-Moving)</h3>
        <table class="data-table" style="width:100%">
          <thead><tr><th>Sản Phẩm</th><th>Kho Còn</th><th>Ngày Tồn</th></tr></thead>
          <tbody>
            <tr><td>Ốp lưng iPhone 13 Thủy tinh</td><td>45</td><td class="value-negative">&gt;120 ngày</td></tr>
            <tr><td>Bao da iPad Pro 11 cũ</td><td>28</td><td class="value-negative">&gt;90 ngày</td></tr>
            <tr><td>Tai nghe có dây Type-C</td><td>60</td><td class="value-warning">&gt;60 ngày</td></tr>
          </tbody>
        </table>
        <div style="margin-top:16px"><button class="btn" style="background:var(--accent-rose-bg); color:var(--accent-rose); border:none; font-size:0.75rem; padding:6px 12px; border-radius:6px">🔥 AI Tạo Flash Sale Xả Hàng</button></div>
      </div>
    </div>
  `;
}
function renderCompetitorHTML() {
  return `
    <div class="content-card" style="margin-bottom: 24px">
      <h3 class="content-card-title">Giám Sát Đối Thủ: MobileWorld Store</h3>
      <div style="display:flex; justify-content:space-between; margin-top:20px; align-items:center;">
        <div>
          <div style="font-weight:600; font-size:1.1rem">So Sánh Giá Trực Tiếp: Tai nghe AirPods Pro Repo</div>
          <div style="margin-top:8px">Shop bạn: <b>189.000₫</b> <span style="color:var(--accent-rose); font-weight:bold">(Cao hơn 10k)</span></div>
          <div>MobileWorld: <b>179.000₫</b> (Vừa giảm giá lúc 10:00 sáng nay)</div>
        </div>
        <button class="btn btn-accept">⚡ Fix giá 175.000₫ ngay</button>
      </div>
    </div>
    
    <div class="content-card">
      <h3 class="content-card-title">Từ khóa Đang Mất Top Về Tay Đối Thủ</h3>
      <table class="data-table" style="width:100%">
        <thead><tr><th>Keyword</th><th>Thứ hạng Shop bạn</th><th>MobileWorld</th><th>Mất Traffic</th></tr></thead>
        <tbody>
          <tr><td>Tai nghe chống ồn</td><td class="value-negative">#5 (↓ 2)</td><td class="value-positive">#1</td><td>-15%</td></tr>
          <tr><td>Loa bluetooth mini</td><td class="value-negative">#8 (↓ 1)</td><td class="value-positive">#3</td><td>-8%</td></tr>
          <tr><td>Ốp điện thoại siêu mỏng</td><td>#2</td><td>#4</td><td>+5%</td></tr>
        </tbody>
      </table>
    </div>
  `;
}
function renderReviewsHTML() {
  return `
    <div class="grid-3" style="margin-bottom: 24px">
      <div class="content-card" style="text-align:center">
         <h3 class="content-card-title">Điểm Đánh Giá Trung Bình</h3>
         <div style="font-size:3rem; font-weight:800; color:var(--text-heading); margin-top:10px;">4.85<span style="font-size:1.5rem; color:var(--accent-amber)">★</span></div>
         <div style="color:var(--text-muted); font-size:0.85rem">Trên tổng 2,450 lượt đánh giá</div>
      </div>
      <div class="content-card" style="grid-column: span 2">
         <h3 class="content-card-title">Sentiment Analysis (Phân tích Cảm xúc)</h3>
         <div class="h-bars" style="margin-top:20px">
            <div class="h-bar-item"><div class="h-bar-label">Tích cực (Khen ngợi)</div><div class="h-bar-track"><div class="h-bar-fill emerald" style="width: 82%"></div></div><div class="h-bar-value">82%</div></div>
            <div class="h-bar-item"><div class="h-bar-label">Trung lập (Bình thường)</div><div class="h-bar-track"><div class="h-bar-fill blue" style="width: 12%"></div></div><div class="h-bar-value">12%</div></div>
            <div class="h-bar-item"><div class="h-bar-label">Tiêu cực (Phàn nàn)</div><div class="h-bar-track"><div class="h-bar-fill rose" style="width: 6%"></div></div><div class="h-bar-value">6%</div></div>
         </div>
      </div>
    </div>
    
    <div class="content-card">
       <h3 class="content-card-title">Từ khóa Thường Gặp Trong Phản Hồi Xấu</h3>
       <div style="display:flex; gap:12px; margin-top:16px">
         <span style="padding:6px 12px; background:var(--accent-rose-bg); color:var(--accent-rose); border-radius:12px; font-size:0.85rem">Giao hàng chậm (45)</span>
         <span style="padding:6px 12px; background:var(--accent-amber-bg); color:var(--accent-amber); border-radius:12px; font-size:0.85rem">Đóng gói móp méo (22)</span>
         <span style="padding:6px 12px; background:var(--bg-glass); color:var(--text-secondary); border-radius:12px; font-size:0.85rem">Phần mềm chưa hỗ trợ (12)</span>
       </div>
    </div>
  `;
}
function renderMediaHTML() {
  return `
    <div class="content-card" style="margin-bottom: 24px">
      <h3 class="content-card-title">Hiệu Suất Quảng Cáo & Affiliates</h3>
      <table class="data-table" style="width:100%; margin-top:20px;">
        <thead><tr><th>Nền tảng / Kênh</th><th>Chi Tiêu (Cost)</th><th>Chuyển Đổi (Sales)</th><th>ROAS</th></tr></thead>
        <tbody>
          <tr><td>Shopee Discovery Ads</td><td>2,500,000₫</td><td>15,200,000₫</td><td class="value-positive">6.08</td></tr>
          <tr><td>TikTok Affiliate Creators</td><td>4,200,000₫</td><td>18,500,000₫</td><td class="value-positive">4.40</td></tr>
          <tr><td>Livestream (Shop tự live)</td><td>1,500,000₫</td><td>4,800,000₫</td><td class="value-warning">3.20</td></tr>
          <tr><td>Facebook Ads (Click to Web)</td><td>2,000,000₫</td><td>3,500,000₫</td><td class="value-negative">1.75</td></tr>
        </tbody>
      </table>
    </div>
  `;
}
function renderChatInboxHTML() {
  return `
    <div class="grid-2">
      <div class="content-card" style="height:500px; display:flex; flex-direction:column; overflow:hidden; padding:0">
         <div style="padding:16px 20px; border-bottom:1px solid var(--border-primary); display:flex; justify-content:space-between">
            <h3 class="content-card-title" style="margin:0">Hộp Thư AI Phân Điền</h3>
            <span style="background:var(--accent-emerald-bg); color:var(--accent-emerald); padding:4px 8px; border-radius:12px; font-size:0.75rem">Bot Tự Động: Bật</span>
         </div>
         <div style="flex:1; overflow-y:auto; padding:0">
            <div style="padding:16px 20px; border-bottom:1px solid var(--border-primary); background:var(--bg-glass)">
               <div style="display:flex; justify-content:space-between; margin-bottom:4px;"><b>Khách hàng #8842</b><span style="font-size:0.75rem; color:var(--text-muted)">10:05</span></div>
               <div style="font-size:0.85rem; color:var(--text-secondary)">Shop ơi mình nhận hàng rồi nhưng màn hình bị ám vàng...</div>
            </div>
            <div style="padding:16px 20px; border-bottom:1px solid var(--border-primary);">
               <div style="display:flex; justify-content:space-between; margin-bottom:4px;"><b>Khách hàng #9021</b><span style="font-size:0.75rem; color:var(--text-muted)">09:12</span></div>
               <div style="font-size:0.85rem; color:var(--text-secondary)">Bao giờ thì có hàng lại mẫu này hả shop?</div>
               <div style="margin-top:8px; display:inline-block; padding:4px 8px; background:var(--accent-emerald-bg); color:var(--accent-emerald); border-radius:4px; font-size:0.75rem">🤖 AI đã trả lời tự động</div>
            </div>
         </div>
      </div>
      
      <div class="content-card" style="display:flex; flex-direction:column;">
         <div style="background:var(--accent-rose-bg); padding:16px; border-radius:8px; margin-bottom:20px;">
            <div style="color:var(--accent-rose); font-size:0.8rem; font-weight:600">⚠️ Cần Giám Đốc Xử Lý Chéo</div>
            <div style="font-size:0.9rem; margin-top:8px;">Khách hàng yêu cầu đổi trả hàng do "màn hình ám vàng". AI thiếu quyền xử lý lệnh hoàn tiền lớn.</div>
         </div>
         
         <div style="flex:1; background:var(--bg-glass); border-radius:8px; padding:16px; margin-bottom:20px; font-size:0.9rem;">
            <b>AI đề xuất mẫu phản hồi:</b><br/><br/>
            "Dạ PhoneMax chào anh/chị, em vô cùng xin lỗi về sự cố màn hình ám vàng. Bên em hỗ trợ đổi mới 100% không mất phí ship ạ. Anh/chị gửi giúp em mã đơn hàng để bên em lên đơn hoàn nhé!"
         </div>
         
         <div style="display:flex; gap:12px;">
            <button class="btn btn-accept" onclick="showToast('success', 'Đã Gửi')" style="flex:1">✅ Gửi theo Đề xuất AI</button>
            <button class="btn" style="flex:1; background:var(--bg-primary); border:1px solid var(--border-primary);">✏️ Chỉnh sửa tay</button>
         </div>
      </div>
    </div>
  `;
}

function renderSettingsHTML() {
  return `
    <div class="grid-2">
      <div class="content-card">
        <h3 class="content-card-title">Hồ Sơ Doanh Nghiệp</h3>
        <div style="display:flex; gap:16px; align-items:center; margin-bottom:20px;">
          <div style="width:64px; height:64px; border-radius:50%; background:var(--gradient-primary); display:flex; align-items:center; justify-content:center; font-size:1.5rem; font-weight:bold; color:#451a03">SP</div>
          <div>
            <div style="font-weight:700; font-size:1.1rem; color:var(--text-heading);">Shop PhoneMax</div>
            <div style="font-size:0.8rem; color:var(--text-muted); margin-top:4px;">Gói dịch vụ: Premium AI · ID: #88902</div>
          </div>
        </div>
        
        <h4 style="font-size:0.85rem; color:var(--accent-indigo); margin:20px 0 12px; border-bottom:1px dashed var(--border-primary); padding-bottom:6px;">Dữ liệu định hướng cho AI Agent</h4>
        <div style="margin-bottom:16px;">
          <label style="display:block; font-size:0.8rem; color:var(--text-secondary); margin-bottom:6px;">Khách hàng mục tiêu</label>
          <input type="text" class="guidance-input" value="Học sinh sinh viên, nhân viên văn phòng" style="width:100%" />
        </div>
        <div style="margin-bottom:16px;">
          <label style="display:block; font-size:0.8rem; color:var(--text-secondary); margin-bottom:6px;">Định hướng chiến lược</label>
          <textarea class="guidance-input" style="width:100%; min-height:70px; resize:vertical;">Ưu tiên đi đầu về giá ở nhóm tai nghe. Giữ biên lợi nhuận cao ở nhóm phụ kiện ốp lưng.</textarea>
        </div>
        <div style="margin-bottom:16px;">
          <label style="display:block; font-size:0.8rem; color:var(--text-secondary); margin-bottom:6px;">Tông giọng Chatbot AI</label>
          <select class="guidance-input" style="width:100%; padding: 10px; background: var(--bg-secondary);">
             <option selected>Lịch sự, nhiệt tình, sử dụng nhiều emoji thân thiện</option>
          </select>
        </div>
        
        <div style="margin-top:24px;">
          <button class="btn btn-accept">Lưu Thay Đổi Setup</button>
        </div>
      </div>
      
      <div class="content-card">
        <h3 class="content-card-title">Kết Nối Đa Sàn / Kênh</h3>
        <div style="margin-top:16px; display:flex; flex-direction:column; gap:16px;">
          <div style="display:flex; justify-content:space-between; align-items:center; padding:12px; background:var(--bg-glass); border-radius:var(--radius-md);">
            <div style="display:flex; align-items:center; gap:12px;">
               <div style="width:36px; height:36px; border-radius:50%; background:var(--accent-emerald-bg); color:var(--accent-emerald); display:flex; justify-content:center; align-items:center; font-weight:bold;">S</div>
               <span style="font-weight:600">Shopee Mall</span>
            </div>
            <span style="padding: 4px 10px; background: var(--gradient-success); color: white; font-size: 0.75rem; border-radius: 20px; font-weight:bold;">Đã kết nối</span>
          </div>
          <div style="display:flex; justify-content:space-between; align-items:center; padding:12px; background:var(--bg-glass); border-radius:var(--radius-md);">
            <div style="display:flex; align-items:center; gap:12px;">
               <div style="width:36px; height:36px; border-radius:50%; background:var(--accent-blue); color:white; display:flex; justify-content:center; align-items:center; font-weight:bold;">T</div>
               <span style="font-weight:600">Tiki Trading</span>
            </div>
            <span style="padding: 4px 10px; background: var(--gradient-success); color: white; font-size: 0.75rem; border-radius: 20px; font-weight:bold;">Đã kết nối</span>
          </div>
          <div style="display:flex; justify-content:space-between; align-items:center; padding:12px; background:var(--bg-glass); border-radius:var(--radius-md);">
            <div style="display:flex; align-items:center; gap:12px;">
               <div style="width:36px; height:36px; border-radius:50%; background:black; color:white; display:flex; justify-content:center; align-items:center; font-weight:bold;">TK</div>
               <span style="font-weight:600">TikTok Shop</span>
            </div>
            <button class="btn" style="padding: 6px 12px; background: var(--bg-card); border: 1px solid var(--border-primary); border-radius: 6px;">+ Kết nối</button>
          </div>
        </div>
      </div>
    </div>
  `;
}

// ===== ĐỊNH TUYẾN TRANG (ROUTER) =====
function renderPage(pageId) {
  appState.currentPage = pageId;
  const container = document.getElementById('pageContent');

  const titles = {
    dashboard: { title: 'Tổng quan', sub: 'Hub Phân Tích Kênh E-Commerce' },
    revenue: { title: 'Doanh thu & Chi phí', sub: 'Phân tích tài chính thời gian thực' },
    inventory: { title: 'Quản lý Tồn kho', sub: 'Cảnh báo và tối ưu vòng quay vốn' },
    competitor: { title: 'Phân tích Đối thủ', sub: 'So sánh giá & Market share' },
    reviews: { title: 'Review Sản phẩm', sub: 'Sentiment Analysis từ khách hàng' },
    media: { title: 'Media & Quảng cáo', sub: 'Hiệu suất Ads và Content' },
    chat: { title: 'Chat AI thông minh', sub: 'Hệ thống tự động phản hồi' },
    settings: { title: 'Cài đặt & Hồ sơ', sub: 'Thiết lập Giám đốc AI' }
  };

  const ti = document.getElementById('pageTitle');
  const su = document.getElementById('pageSubtitle');
  if (ti) ti.textContent = titles[pageId]?.title || 'Tổng quan';
  if (su) su.textContent = titles[pageId]?.sub + ' – Cập nhật lúc ' + new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });

  switch (pageId) {
    case 'dashboard': container.innerHTML = renderDashboardHTML(); break;
    case 'revenue': container.innerHTML = renderRevenueHTML(); break;
    case 'inventory': container.innerHTML = renderInventoryHTML(); break;
    case 'competitor': container.innerHTML = renderCompetitorHTML(); break;
    case 'reviews': container.innerHTML = renderReviewsHTML(); break;
    case 'media': container.innerHTML = renderMediaHTML(); break;
    case 'chat': container.innerHTML = renderChatInboxHTML(); break;
    case 'settings': container.innerHTML = renderSettingsHTML(); break;
    default: container.innerHTML = '<div class="content-card">Coming soon...</div>';
  }
}

// ===== KHỞI TẠO =====
function setupNav() {
  const navItems = document.querySelectorAll('.nav-item[data-page]');
  navItems.forEach(item => {
    item.addEventListener('click', () => {
      navItems.forEach(n => n.classList.remove('active'));
      item.classList.add('active');
      renderPage(item.dataset.page);
    });
  });
}

function init() {
  setupNav();
  renderPage('dashboard');

  // Toolbar AI guidance
  const sendBtn = document.getElementById('guidanceSendBtn');
  const input = document.getElementById('guidanceInput');
  const activeCmdBox = document.getElementById('guidanceActiveCmd');
  const activeCmdText = document.getElementById('guidanceActiveCmdText');
  const clearBtn = document.getElementById('guidanceClearBtn');

  if (sendBtn) {
    sendBtn.addEventListener('click', () => {
      if (!input.value.trim()) return;
      activeCmdText.textContent = input.value;
      activeCmdBox.style.display = 'flex';
      input.value = '';
      showToast('info', 'AI đã nhận chiến lược và đang tái tính toán ưu tiên!');
    });
  }
  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      activeCmdBox.style.display = 'none';
      showToast('info', 'Đã hủy lệnh ưu tiên.');
    });
  }
  document.querySelectorAll('.guidance-tag').forEach(btn => {
    btn.addEventListener('click', () => {
      input.value = btn.dataset.cmd;
    });
  });

  const btnScan = document.getElementById('btnScan');
  const overlay = document.getElementById('scanOverlay');

  if (btnScan) {
    btnScan.addEventListener('click', async () => {
      // 1. Hiển thị UI Loading
      btnScan.classList.add('scanning');
      if (overlay) overlay.classList.add('show');

      // 2. Gom dữ liệu hiện tại (Dữ liệu gửi đi cho /slow-track-strategy)
      const requestData = {
        product_id: "SKU-TEST-01",
        product_name: "Tai nghe Bluetooth",
        internal_data: { current_price: 250000, stock_level: 450, cost_price: 150000, min_margin_percent: 15, conversion_rate: 0.05 },
        market_data: { competitor_min_price: 230000, market_trend: "stable", competitor_name: "Shop Đối Thủ", competitor_rating: 4.2, our_rating: 4.8, platform_campaign: "None" },
        customer_context: { recent_sentiment: "positive", frequent_question: "Có chống ồn không shop?" },
        // Lấy chỉ thị thực tế từ ô nhập liệu trên giao diện
        manager_directive: document.getElementById('guidanceActiveCmdText')?.textContent || ""
      };

      try {
        // 3. SỬA URL: Gọi thẳng vào endpoint luồng chậm của Agent
        const response = await fetch('http://127.0.0.1:8000/slow-track-strategy', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(requestData)
        });

        if (!response.ok) throw new Error("Lỗi kết nối Server");
        const result = await response.json();

        // 4. SỬA CÁCH ĐỌC JSON (Bóc tách dữ liệu AI trả về)
        if (result.status === "success") {
          const aiData = result.data; // Sửa ở đây: không còn .data.data nữa

          // Tạo object chiến lược mới
          const newStrategy = {
            id: result.proposal_id, // Sửa ở đây
            type: 'pricing',
            status: 'pending',
            title: `Đề xuất Giá: ${aiData.proposed_price}đ`,
            description: `<b>Lý do:</b> ${aiData.pricing_reasoning}<br><br><b>Nội dung:</b> ${aiData.content_update_suggestion}`,
            confidence: 95,
            impact: aiData.urgency_level.toLowerCase(),
            current_value: `250.000₫`,
            suggested_value: `${aiData.proposed_price}₫`
          };

          // Đẩy thẻ mới này lên đầu danh sách và vẽ lại Dashboard
          appState.strategies.unshift(newStrategy);
          renderPage('dashboard');
          showToast('success', 'AI đã hoàn tất phân tích và ra quyết định!');
        }
      } catch (error) {
        console.error("Integration Error:", error);
        showToast('error', 'Lỗi kết nối Backend. Hãy chắc chắn main.py đang chạy!');
      } finally {
        // Tắt UI Loading
        btnScan.classList.remove('scanning');
        if (overlay) overlay.classList.remove('show');
      }
    });
  }
}

document.addEventListener('DOMContentLoaded', init);
