const express = require('express');
const multer = require('multer');
const xlsx = require('xlsx');
const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');

const app = express();
const port = 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// تكوين رفع الملفات
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, 'uploads/')
    },
    filename: function (req, file, cb) {
        cb(null, Date.now() + '-' + file.originalname)
    }
});
const upload = multer({ storage: storage });

// إنشاء قاعدة البيانات
const db = new sqlite3.Database('./database/orders.db');

// إنشاء الجدول
db.serialize(() => {
    db.run(`
        CREATE TABLE IF NOT EXISTS orders (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            order_id TEXT,
            first_name TEXT,
            last_name TEXT,
            phone TEXT,
            state TEXT,
            municipality TEXT,
            status TEXT DEFAULT 'pending',
            decision TEXT,
            delay_date TEXT,
            notes TEXT,
            rejection_count INTEGER DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);
});

// 1️⃣ رفع الملف ومعالجته
app.post('/upload', upload.single('file'), (req, res) => {
    try {
        const filePath = req.file.path;
        const workbook = xlsx.readFile(filePath);
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const data = xlsx.utils.sheet_to_json(worksheet);

        // إدخال البيانات في قاعدة البيانات
        const stmt = db.prepare(`
            INSERT INTO orders 
            (order_id, first_name, last_name, phone, state, municipality) 
            VALUES (?, ?, ?, ?, ?, ?)
        `);

        data.forEach((row, index) => {
            stmt.run(
                `ORDER-${Date.now()}-${index}`,
                row['الاسم'] || row['firstName'] || row['name'],
                row['اللقب'] || row['lastName'] || row['surname'],
                row['رقم الهاتف'] || row['phone'] || row['telephone'],
                row['الولاية'] || row['state'],
                row['البلدية'] || row['municipality']
            );
        });

        stmt.finalize();

        // الحصول على الطلبية الأولى
        db.get('SELECT * FROM orders WHERE status = ? LIMIT 1', ['pending'], (err, order) => {
            if (err) {
                res.status(500).json({ error: err.message });
                return;
            }
            res.json({ 
                success: true, 
                total: data.length, 
                currentOrder: order 
            });
        });

    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// 2️⃣ الحصول على الطلبية التالية
app.get('/next-order', (req, res) => {
    db.get('SELECT * FROM orders WHERE status = ? LIMIT 1', ['pending'], (err, order) => {
        if (err) {
            res.status(500).json({ error: err.message });
            return;
        }
        res.json({ order: order || null });
    });
});

// 3️⃣ معالجة قرار المستخدم
app.post('/process-order', (req, res) => {
    const { orderId, decision, delayDate, notes } = req.body;

    let newStatus = '';
    let updateQuery = '';

    switch(decision) {
        case 'accept':
            newStatus = 'completed';
            updateQuery = 'UPDATE orders SET status = ?, decision = ?, notes = ? WHERE id = ?';
            db.run(updateQuery, [newStatus, 'accepted', notes, orderId]);
            break;

        case 'delay':
            newStatus = 'delayed';
            updateQuery = 'UPDATE orders SET status = ?, decision = ?, delay_date = ?, notes = ? WHERE id = ?';
            db.run(updateQuery, [newStatus, 'delayed', delayDate, notes, orderId]);
            break;

        case 'reject':
            // زيادة عداد الرفض
            db.get('SELECT rejection_count FROM orders WHERE id = ?', [orderId], (err, row) => {
                if (err) {
                    res.status(500).json({ error: err.message });
                    return;
                }

                const newCount = (row.rejection_count || 0) + 1;

                if (newCount >= 3) {
                    // رفض نهائي بعد 3 مرات
                    db.run('UPDATE orders SET status = ?, decision = ?, rejection_count = ?, notes = ? WHERE id = ?',
                        ['rejected', 'rejected_final', newCount, notes, orderId]);
                } else {
                    // رفض عادي
                    db.run('UPDATE orders SET status = ?, decision = ?, rejection_count = ?, notes = ? WHERE id = ?',
                        ['pending', 'rejected', newCount, notes, orderId]);
                }
            });
            break;
    }

    res.json({ success: true });
});

// 4️⃣ تنزيل الملف النهائي
app.get('/download-final', (req, res) => {
    db.all('SELECT * FROM orders', (err, rows) => {
        if (err) {
            res.status(500).json({ error: err.message });
            return;
        }

        // تحويل البيانات إلى Excel
        const worksheet = xlsx.utils.json_to_sheet(rows);
        const workbook = xlsx.utils.book_new();
        xlsx.utils.book_append_sheet(workbook, worksheet, 'الطلبيات المعالجة');

        const filePath = path.join(__dirname, 'final_orders.xlsx');
        xlsx.writeFile(workbook, filePath);

        res.download(filePath);
    });
});

// بدء الخادم
app.listen(port, () => {
    console.log(`✅ الخادم يعمل على http://localhost:${port}`);
});
