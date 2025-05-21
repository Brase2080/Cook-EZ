import express from 'express'

const authRouter = express.Router()

authRouter.get('/login', (req, res) => {
    res.render('login')
})

authRouter.get('/logout', (req, res) => {
    res.send("Logging out")
})

authRouter.get('/google', (req, res) => {

    res.send("logging in with google")
})

export default authRouter