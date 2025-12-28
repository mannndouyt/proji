let currentOrder = null;
let totalOrders = 0;
let processedOrders = 0;

// رفع الملف
document.getElementById('file-input').addEventListener('change', async function(e) {
    const file = e.target.files[0];
    if (!file) return;

    const uploadBox = document.querySelector('.upload-box');
    uploadBox.innerHTML = `
        <i class="fas fa-spinner fa-spin"></i>
        <p>جاري رفع الملف...</p>
        <p class="hint">${file.name}</p>
    `;

    const formData = new FormData();
    formData.append('file', file);

    try {
        const response = await fetch('/upload', {
            method: 'POST',
            body: formData
        });

        const result = await response.json();

        if (result.success) {
            showNotification('تم رفع الملف بنجاح!', 'success');
            document.getElementById('process-btn').disabled = false;
            
            totalOrders = result.total;
            currentOrder = result.currentOrder;
            
            // تحديث العداد
            updateStats();
        }
    } catch (error) {
        showNotification('حدث خطأ في رفع الملف', 'error');
        console.error(error);
    }
});

// بدء المعالجة
document.getElementById('process-btn').addEventListener('click', function() {
    document.getElementById('upload-section').classList.remove('active');
    document.getElementById('upload-section').style.display = 'none';
    document.getElementById('processing-section').style.display = 'block';
    
    loadNextOrder();
});

// تحميل الطلبية التالية
async function loadNextOrder() {
    try {
        const response = await fetch('/next-order');
        const result = await response.json();
        
        if (result.order) {
            currentOrder = result.order;
            updateOrderDisplay();
            processedOrders++;
            updateStats();
        } else {
            // لا توجد طلبيات أخرى
            finishProcessing();
        }
    } catch (error) {
        console.error(error);
        showNotification('حدث خطأ في تحميل الطلبية', 'error');
    }
}

// تحديث عرض الطلبية
function updateOrderDisplay() {
    document.getElementById('current-order-id').textContent = currentOrder.order_id;
    document.getElementById('order-first-name').textContent = currentOrder.first_name;
    document.getElementById('order-last-name').textContent = currentOrder.last_name;
    document.getElementById('order-phone').textContent = currentOrder.phone;
    document.getElementById('order-state').textContent = currentOrder.state;
    document.getElementById('order-municipality').textContent = currentOrder.municipality;
    
    // تحديث العداد
    document.getElementById('order-counter').textContent = 
        `(${processedOrders + 1} من ${totalOrders})`;
}

// قبول الطلبية
async function acceptOrder() {
    const notes = prompt('أدخل ملاحظة (اختياري):') || '';
    
    await processOrder('accept', null, notes);
    await loadNextOrder();
}

// عرض نافذة التأجيل
function showDelayModal() {
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('delay-date').value = today;
    document.getElementById('delay-date').min = today;
    document.getElementById('delay-modal').style.display = 'flex';
}

// تأجيل الطلبية
async function delayOrder() {
    const date = document.getElementById('delay-date').value;
    const notes = document.getElementById('delay-notes').value;
    
    if (!date) {
        showNotification('الرجاء اختيار تاريخ التأجيل', 'warning');
        return;
    }
    
    await processOrder('delay', date, notes);
    closeModal('delay-modal');
    await loadNextOrder();
}

// عرض نافذة الرفض
function showRejectModal() {
    const counter = currentOrder.rejection_count || 0;
    let message = '';
    
    switch(counter) {
        case 0: message = 'الرفض الأول - سيتم الرفض النهائي بعد 3 مرات'; break;
        case 1: message = 'الرفض الثاني - بعد رفض آخر سيتم الرفض النهائي'; break;
        case 2: message = 'الرفض الثالث والأخير - سيتم رفض الطلبية نهائياً'; break;
    }
    
    document.getElementById('rejection-counter').textContent = message;
    document.getElementById('reject-modal').style.display = 'flex';
}

// رفض الطلبية
async function rejectOrder() {
    const notes = document.getElementById('reject-notes').value;
    
    await processOrder('reject', null, notes);
    closeModal('reject-modal');
    await loadNextOrder();
}

// معالجة الطلبية
async function processOrder(decision, delayDate, notes) {
    try {
        const response = await fetch('/process-order', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                orderId: currentOrder.id,
                decision: decision,
                delayDate: delayDate,
                notes: notes
            })
        });

        const result = await response.json();
        
        if (result.success) {
            showNotification('تم حفظ القرار بنجاح', 'success');
        }
    } catch (error) {
        console.error(error);
        showNotification('حدث خطأ في حفظ القرار', 'error');
    }
}

// إنهاء المعالجة
function finishProcessing() {
    document.getElementById('processing-section').style.display = 'none';
    document.getElementById('results-section').style.display = 'block';
    
    // تحديث ملخص النتائج
    updateResultsSummary();
}

// تحديث الإحصائيات
function updateStats() {
    document.getElementById('total-orders').textContent = totalOrders;
    document.getElementById('completed-orders').textContent = processedOrders;
    document.getElementById('pending-orders').textContent = totalOrders - processedOrders;
}

// تحديث ملخص النتائج
async function updateResultsSummary() {
    try {
        const response = await fetch('/get-summary');
        const summary = await response.json();
        
        document.getElementById('results-summary').innerHTML = `
            <div class="stats">
                <div class="stat-box">
                    <span>${summary.accepted}</span>
                    <small>مقبولة</small>
                </div>
                <div class="stat-box">
                    <span>${summary.delayed}</span>
                    <small>مؤجلة</small>
                </div>
                <div class="stat-box">
                    <span>${summary.rejected}</span>
                    <small>مرفوضة</small>
                </div>
            </div>
        `;
    } catch (error) {
        console.error(error);
    }
}

// تحميل النتائج
function downloadResults() {
    window.open('/download-final', '_blank');
}

// إعادة البدء
function restartProcess() {
    location.reload();
}

// إغلاق النوافذ
function closeModal(modalId) {
    document.getElementById(modalId).style.display = 'none';
    // مسح الحقول
    if (modalId === 'delay-modal') {
        document.getElementById('delay-notes').value = '';
    } else if (modalId === 'reject-modal') {
        document.getElementById('reject-notes').value = '';
    }
}

// عرض الإشعارات
function showNotification(message, type) {
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.innerHTML = `
        <i class="fas fa-${type === 'success' ? 'check-circle' : 'exclamation-circle'}"></i>
        <span>${message}</span>
    `;
    
    document.body.appendChild(notification);
    
    setTimeout(() => {
        notification.classList.add('show');
    }, 10);
    
    setTimeout(() => {
        notification.classList.remove('show');
        setTimeout(() => {
            notification.remove();
        }, 300);
    }, 3000);
}

// إضافة تنسيقات للإشعارات
const style = document.createElement('style');
style.textContent = `
    .notification {
        position: fixed;
        top: 20px;
        left: 50%;
        transform: translateX(-50%);
        background: white;
        padding: 15px 25px;
        border-radius: 10px;
        box-shadow: 0 10px 30px rgba(0,0,0,0.3);
        display: flex;
        align-items: center;
        gap: 10px;
        z-index: 10000;
        opacity: 0;
        transform: translateX(-50%) translateY(-20px);
        transition: all 0.3s;
    }
    
    .notification.show {
        opacity: 1;
        transform: translateX(-50%) translateY(0);
    }
    
    .notification.success {
        border-right: 5px solid var(--success);
    }
    
    .notification.error {
        border-right: 5px solid var(--danger);
    }
    
    .notification.warning {
        border-right: 5px solid var(--warning);
    }
`;
document.head.appendChild(style);
