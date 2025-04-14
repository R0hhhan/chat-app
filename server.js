// Install required packages:
// npm install mongoose bcrypt jsonwebtoken dotenv

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const dotenv = require('dotenv');
const path = require('path');
const cookieParser = require('cookie-parser');

// Initialize environment variables
dotenv.config();

// Initialize Express app
const app = express();
const server = http.createServer(app);
const io = new Server(server);

// MongoDB connection
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/chatapp')
    .then(() => console.log('Connected to MongoDB'))
    .catch(err => console.error('MongoDB connection error:', err));

// User schema and model
const userSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    createdAt: { type: Date, default: Date.now }
});

// Middleware to hash password before saving
userSchema.pre('save', async function (next) {
    if (!this.isModified('password')) return next();
    try {
        const salt = await bcrypt.genSalt(10);
        this.password = await bcrypt.hash(this.password, salt);
        next();
    } catch (error) {
        next(error);
    }
});

const User = mongoose.model('User', userSchema);

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(express.static(path.join(__dirname, 'public')));
app.use(cookieParser());

// Authentication middleware
const authenticateToken = (req, res, next) => {
    const token = req.cookies?.token || req.headers.authorization?.split(' ')[1];


    console.log(token);
    if (!token) return res.status(401).json({ message: 'Authentication required' });

    jwt.verify(token, process.env.JWT_SECRET || 'your_jwt_secret', (err, user) => {
        if (err) return res.status(403).json({ message: 'Invalid or expired token' });
        req.user = user;
        next();
    });
};

// Routes
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

app.get('/chat', authenticateToken, (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'chat.html'));
});

// Auth routes
app.post('/api/signup', async (req, res) => {
    try {
        const { username, email, password } = req.body;

        // Validate input
        if (!username || !email || !password) {
            return res.status(400).json({ message: 'All fields are required' });
        }

        // Check if user already exists
        const existingUser = await User.findOne({ $or: [{ username }, { email }] });
        if (existingUser) {
            return res.status(409).json({ message: 'Username or email already exists' });
        }

        // Create new user
        const user = new User({ username, email, password });
        await user.save();

        // Generate token
        const token = jwt.sign(
            { id: user._id, username: user.username },
            process.env.JWT_SECRET || 'your_jwt_secret',
            { expiresIn: '1d' }
        );
        res.cookie('token', token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production', // Only send over HTTPS in production
            maxAge: 24 * 60 * 60 * 1000, // 1 day in milliseconds
            path: '/',
        });
        res.status(200).json({ message: 'Login successful', username: user.username, token: token }); // Or signup response
    } catch (error) {
        console.error('Registration error:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

app.post('/api/login', async (req, res) => {
    try {
        const { username, password } = req.body;

        // Validate input
        if (!username || !password) {
            return res.status(400).json({ message: 'Username and password are required' });
        }

        // Find user
        const user = await User.findOne({ username });
        if (!user) {
            return res.status(401).json({ message: 'Invalid credentials' });
        }

        // Verify password
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(401).json({ message: 'Invalid credentials' });
        }

        // Generate token
        const token = jwt.sign(
            { id: user._id, username: user.username },
            process.env.JWT_SECRET || 'your_jwt_secret',
            { expiresIn: '1d' }
        );
        res.cookie('token', token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production', // Only send over HTTPS in production
            maxAge: 24 * 60 * 60 * 1000, // 1 day in milliseconds
            path: '/',
        });
        res.status(200).json({ message: 'Login successful', username: user.username, token: token }); // Or signup response
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

// Socket.io with authentication
io.use((socket, next) => {
    const token = socket.handshake.auth.token;
    if (!token) {
        return next(new Error('Authentication required'));
    }

    jwt.verify(token, process.env.JWT_SECRET || 'your_jwt_secret', (err, decoded) => {
        if (err) return next(new Error('Invalid token'));
        socket.user = decoded;
        next();
    });
});

io.on('connection', (socket) => {
    console.log('User connected:', socket.user.username, socket.id);

    // Notify others that a user has joined
    socket.broadcast.emit('user joined', socket.user.username);

    socket.on('chat message', (msg) => {
        console.log('Message:', msg);
        io.emit('chat message', {
            sender: socket.user.username,
            message: msg,
            time: new Date().toISOString()
        });
    });

    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.user.username);
        socket.broadcast.emit('user left', socket.user.username);
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server listening on http://localhost:${PORT}`);
});