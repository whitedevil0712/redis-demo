const express = require('express');
const mysql = require('mysql2');
const Redis = require('ioredis');
const bodyParser = require('body-parser');
const path = require('path');

const app = express();
app.use(bodyParser.json());

// MySQL connection setup
// const db = mysql.createConnection({
//     host: 'localhost',
//     user: 'root',
//     password: 'redhat',
//     database: 'emp_db'
// });
const db = mysql.createConnection('mysql://root:redhat@localhost/emp_db');

db.connect(err => {
    if (err) {
        console.error('Error connecting to MySQL:', err);
        return;
    }
    console.log('Connected to MySQL');
});

//Redis connection setup
const redis = new Redis.Cluster([
   { port: 6379, host: '192.168.96.102' },
   { port: 6379, host: '192.168.96.106' },
   { port: 6379, host: '192.168.96.103' }
]);

// Serve static files (HTML, CSS, JS)
app.use(express.static(path.join(__dirname)));

// Route to add an employee
app.post('/add-employee', (req, res) => {
    const { id, name } = req.body;
    const sql = 'INSERT INTO employee (id, name) VALUES (?, ?)';
    db.query(sql, [id, name], (err, result) => {
        if (err) {
            return res.status(500).send('Error adding employee');
        }
        // Clear cache for this employee
        redis.del(`employee:${id}`);
        res.send('Employee added successfully');
    });
});

// Route to get employee by ID with caching
app.get('/get-employee/:id', async (req, res) => {
    const { id } = req.params;

    try {
        // Check cache first
        const cachedEmployee = await redis.get(`employee:${id}`);

        if (cachedEmployee) {
            // Cache hit
            console.log('Cache hit');
            return res.send(`Employee Name: ${cachedEmployee}`);
        }

        // Cache miss, fetch from MySQL
        console.log('Cache miss');
        const sql = 'SELECT name FROM employee WHERE id = ?';
        db.query(sql, [id], (err, results) => {
            if (err) {
                return res.status(500).send('Error fetching employee');
            }
            if (results.length === 0) {
                return res.status(404).send('Employee not found');
            }

            const employeeName = results[0].name;

            // Store result in Redis with expiration
            redis.set(`employee:${id}`, employeeName, 'EX', 3600); // Cache expires in 1 hour

            res.send(`Employee Name: ${employeeName}`);
        });
    } catch (err) {
        res.status(500).send('Error interacting with Redis');
    }
});

// Start the server
const PORT = 3000;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
