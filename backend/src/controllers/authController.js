import bcrypt from "bcrypt";
import User from "../models/User.js";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import Session from "../models/Session.js";

const ACCESS_TOKEN_EXPIRY = "30m"; // 30 minutes
const REFRESH_TOKEN_EXPIRY = 14 * 24 * 60 * 60 * 1000; // 14 days in milliseconds

export const register = async (req, res) => {
  try {
    const { username, email, password, firstName, lastName } = req.body;

    if (!username || !email || !password || !firstName || !lastName) {
      return res.status(400).json({ message: "All fields are required" });
    }

    // Check if the user already exists
    const duplicateUser = await User.findOne({ username });
    if (duplicateUser) {
      return res.status(400).json({ message: "Username already exists" });
    }

    // Hash the password
    const hashedPassword = await bcrypt.hash(password, 10); //salt rounds = 10

    // Create a new user
    await User.create({
      username,
      email,
      hashedPassword,
      displayName: `${firstName} ${lastName}`,
    });

    // return
    return res.sendStatus(204);
  } catch (error) {
    console.error("Error during registration:", error);
    res.status(500).json({ message: error.message });
  }
};

export const login = async (req, res) => {
  try {
    //get username and password from request body
    const { username, password } = req.body;

    if (!username || !password) {
      return res
        .status(400)
        .json({ message: "Username and password are required" });
    }

    //get hashed password from database to compare with the password from request body
    const user = await User.findOne({ username });

    if (!user) {
      return res.status(401).json({ message: "Invalid username or password" });
    }

    const isPasswordValid = await bcrypt.compare(password, user.hashedPassword);

    if (!isPasswordValid) {
      return res.status(401).json({ message: "Invalid username or password" });
    }

    //if user matches, create access token with jwt
    const accessToken = jwt.sign(
      { userId: user._id },
      process.env.ACCESS_TOKEN_SECRET,
      { expiresIn: ACCESS_TOKEN_EXPIRY },
    );

    //create refresh token
    const refreshToken = crypto.randomBytes(64).toString("hex");

    //create new session to save refresh token in database
    await Session.create({
      userId: user._id,
      refreshToken,
      expiresAt: new Date(Date.now() + REFRESH_TOKEN_EXPIRY), // 14 days from now
    });

    //return refresh token to cookie
    res.cookie("refreshToken", refreshToken, {
      httpOnly: true,
      secure: true, // set to true if using https\
      sameSite: "none", // backend, frontend deployed on different domains
      maxAge: REFRESH_TOKEN_EXPIRY,
    });

    //return refresh token to response body
    return res.status(200).json({
      message: `User ${user.username} logged in successfully`,
      accessToken,
    });
  } catch (error) {
    console.error("Error during login:", error);
    res.status(500).json({ message: error.message });
  }
};

export const logout = async (req, res) => {
  try {
    //get refresh token from cookie
    const token = req.cookies?.refreshToken;

    if (token) {
      //delete session from database
      await Session.deleteOne({ refreshToken: token });

      //clear cookie
      res.clearCookie("refreshToken");
    }

    return res.sendStatus(204);
  } catch (error) {
    console.error("Error during logout:", error);
    res.status(500).json({ message: error.message });
  }
};
