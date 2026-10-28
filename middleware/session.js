const session = require('express-session')
const connectMongo = require('connect-mongo')
require('dotenv').config()

const MongoStore = connectMongo.default || connectMongo

const COOKIE_NAME = 'sid'

const store = MongoStore.create({
  mongoUrl: process.env.MONGODB_URL,
  collectionName: process.env.SESSION_COLLECTION || 'sessions',
  ttl: 60 * 60,
  mongoOptions: { serverSelectionTimeoutMS: 5000 },
})

store.clientP
  .then(() => console.log('Mongo session store connected'))
  .catch((err) => console.error('Mongo session store FAILED:', err.message))

const options = {
  store,
  name: COOKIE_NAME,
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: 'lax',
    secure: false,            // true only when serving over HTTPS
    maxAge: 1000 * 60 * 60,   // match the ttl above
  },
}

const initSession = (app) => {
  app.use(session(options))
}

module.exports = { initSession, COOKIE_NAME }