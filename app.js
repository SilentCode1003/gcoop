var createError = require('http-errors');
var express = require('express');
var path = require('path');
var cookieParser = require('cookie-parser');
var logger = require('morgan');
const {testConnection} = require("./database/config/db")
const {initSession} = require("./middleware/session")
const{auth} = require("./middleware/auth")

var authRouter = require('./routes/auth')
var indexRouter = require('./routes/index');
var dashboardRouter = require('./routes/dashboard');
var membersRouter = require('./routes/members');
var usersRouter = require('./routes/users');
var rolesRouter = require('./routes/roles');
var routesRouter = require('./routes/routes');
var permissionsRouter = require('./routes/permissions')
var loanRatesRouter = require('./routes/loan-rates')
var denominationRouter = require('./routes/denominations')

var app = express();

// view engine setup
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');
testConnection();

app.use(logger('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

initSession(app);
app.use("/auth", authRouter);
app.use(auth)
app.use('/', indexRouter);
app.use('/dashboard', dashboardRouter);
app.use('/members', membersRouter);
app.use('/users', usersRouter);
app.use('/roles', rolesRouter);
app.use('/routes', routesRouter);
app.use('/permissions', permissionsRouter)
app.use('/loan-rates', loanRatesRouter)
app.use('/denominations', denominationRouter)


// // catch 404 and forward to error handler
// app.use(function(req, res, next) {
//   next(createError(404));
// });

// error handler
app.use(function(err, req, res, next) {
  // set locals, only providing error in development
  res.locals.message = err.message;
  res.locals.error = req.app.get('env') === 'development' ? err : {};

  // render the error page
  res.status(err.status || 500);
  console.error(err);

res.status(err.status || 500).send(`
<h2>${err.message}</h2>
<pre>${err.stack}</pre>
`);
});

module.exports = app;
