const express = require("express");
const path = require("path");
const { open } = require("sqlite");
const sqlite3 = require("sqlite3");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

const app = express();
app.use(express.json());
module.exports = app;

let db = null;

// Function to Start Server and Connect to Database

const initializeDBandServer = async () => {
  try {
    db = await open({
      filename: path.join(__dirname, "twitterClone.db"),
      driver: sqlite3.Database,
    });

    app.listen(
      3000,
      console.log(
        "Database Connected .Server Started at http://localhost/3000/"
      )
    );
  } catch (error) {
    console.log(`Error .${error.message}`);
    process.exit(1);
  }
};

initializeDBandServer();

// JWT Token Authorizer Function ( Middleware )

const authenticateUser = (request, response, next) => {
  const authenticationHeader = request.headers["authorization"];
  let jwtToken;

  if (authenticationHeader !== undefined) {
    jwtToken = authenticationHeader.split(" ")[1];
  }

  if (jwtToken !== undefined) {
    jwt.verify(jwtToken, "Secret_Key", async (error, payload) => {
      if (error) {
        response.status(401);
        response.send("Invalid JWT Token");
      } else {
        request.username = payload.username;
        next();
      }
    });
  } else {
    response.status(401);
    response.send("Invalid JWT Token");
  }
};

// Function To Check If User Requested Tweet is by a User he is Following

const checkIfFollowing = async (tweetId, username) => {
  const getUserIdQuery = `select user_id as user_id from user where username="${username}";`;
  const userID = (await db.get(getUserIdQuery)).user_id;
  const getTweetUserID = `select user_id as user_id from tweet where tweet_id = ${tweetId};`;
  const tweetUserID = (await db.get(getTweetUserID)).user_id;
  console.log(tweetUserID);
  const isFollowingQuery = `select follower_id from follower where follower_user_id=${userID} and following_user_id=${tweetUserID.user_id};`;
  const isFollowing = await db.get(isFollowingQuery);
  console.log(isFollowing);
  if (isFollowing !== undefined) {
    return false;
  } else {
    return true;
  }
};
// API 1 - Register

app.post("/register/", async (request, response) => {
  let { username, password, name, gender } = request.body;
  const checkUserExistingQuery = `select * from user where username="${username}";`;
  const existingUser = await db.get(checkUserExistingQuery);
  if (existingUser !== undefined) {
    response.status(400);
    response.send("User already exists");
  } else if (password.length < 6) {
    response.status(400);
    response.send("Password is too short");
  } else {
    const hashedPassword = await bcrypt.hash(password, 10);
    const createUserQuery = `insert into user (username, password, name, gender) values ("${username}", "${hashedPassword}", "${name}", "${gender}");`;
    await db.run(createUserQuery);
    response.send("User created successfully");
  }
});

// API 2 - Login

app.post("/login/", async (request, response) => {
  let { username, password } = request.body;
  const checkUserExistingQuery = `select * from user where username="${username}";`;
  const existingUser = await db.get(checkUserExistingQuery);
  if (existingUser == undefined) {
    response.status(400);
    response.send("Invalid user");
  } else {
    const isCorrectPassword = await bcrypt.compare(
      password,
      existingUser.password
    );
    if (isCorrectPassword) {
      const payload = { username: username };
      const jwtToken = jwt.sign(payload, "Secret_Key");
      response.send({ jwtToken });
    } else {
      response.status(400);
      response.send("Invalid password");
    }
  }
});

// API 3 - Return Tweets of Following Users

app.get("/user/tweets/feed/", authenticateUser, async (request, response) => {
  const { username } = request;
  const getUserIdQuery = `select user_id from user where username="${username}";`;
  const userID = (await db.get(getUserIdQuery)).user_id;
  const getTweetsQuery = `select user.username, tweet.tweet,tweet.date_time as dateTime from (tweet left join ( follower left join user on follower.following_user_id = user.user_id ) on follower.following_user_id = tweet.user_id) where follower.follower_user_id = ${userID} order by date_time DESC limit 4;`;
  const tweets = await db.all(getTweetsQuery);
  response.send(tweets);
});

// API 4 - Return All the Users a User is Following

app.get("/user/following/", authenticateUser, async (request, response) => {
  const { username } = request;
  const getUserIdQuery = `select user_id from user where username="${username}";`;
  const userID = (await db.get(getUserIdQuery)).user_id;
  const getFollowingUsersQuery = `select user.name from follower left join user on follower.following_user_id = user.user_id where follower.follower_user_id = ${userID}; `;
  const followingUsers = await db.all(getFollowingUsersQuery);
  response.send(followingUsers);
});

// API 5 - Get All The Followers of a User

app.get("/user/followers/", authenticateUser, async (request, response) => {
  const { username } = request;
  const getUserIdQuery = `select user_id from user where username="${username}";`;
  const userID = (await db.get(getUserIdQuery)).user_id;
  const getFollowersQuery = `select user.name from follower left join user on follower.follower_user_id = user.user_id where follower.following_user_id = ${userID}; `;
  const followers = await db.all(getFollowersQuery);
  response.send(followers);
});

// API 6 - Get a Tweet

app.get("/tweets/:tweetId/", authenticateUser, async (request, response) => {
  const tweetId = request.params;
  const { username } = request;

  const isUserFollowing = checkIfFollowing(tweetId, username);
  if (isUserFollowing) {
    const getTweetDetailsQuery = `select tweet.tweet as tweet,count(distinct like.like_id) as likes,count(distinct reply.reply_id) as replies,tweet.date_time as dateTime from (tweet left join like on tweet.tweet_id=like.tweet_id) inner join reply on tweet.tweet_id=reply.tweet_id where tweet.tweet_id=${tweetId};`;
    const tweetDetails = await db.get(getTweetDetailsQuery);
    response.send(tweetDetails);
  } else {
    response.status(401);
    response.send("Invalid Request");
  }
});

// API 7 - Get Users Who Liked a Tweet

app.get(
  "/tweets/:tweetId/likes/",
  authenticateUser,
  async (request, response) => {
    const { tweetId } = request.params;
    const { username } = request;

    const isUserFollowing = checkIfFollowing(tweetId, username);

    if (isUserFollowing) {
      const getTweetLikesQuery = `select user.username from like left join user on like.user_id = user.user_id where like.tweet_id=${tweetId};`;
      const likedUsers = await db.all(getTweetLikesQuery);
      let likedUsersArray = [];
      likedUsers.forEach((user) => {
        likedUsersArray.push(user.username);
      });
      response.send({ likes: likedUsersArray });
    } else {
      response.status(401);
      response.send("Invalid Request");
    }
  }
);

// API 8 - Get Users Who Replied for a Tweet

app.get(
  "/tweets/:tweetId/replies/",
  authenticateUser,
  async (request, response) => {
    const { tweetId } = request.params;
    const { username } = request;

    const isUserFollowing = checkIfFollowing(tweetId, username);

    if (isUserFollowing) {
      const getReplyQuery = `select user.name as name,reply.reply as reply from reply left join user on reply.user_id = user.user_id where reply.tweet_id=${tweetId};`;
      const replies = await db.all(getReplyQuery);
      response.send({ replies: replies });
    } else {
      response.status(401);
      response.send("Invalid Request");
    }
  }
);

// API 9 - Get all the Tweets of a User

app.get("/user/tweets/", authenticateUser, async (request, response) => {
  const { username } = request;
  const getUserIdQuery = `select user_id from user where username="${username}";`;
  const userID = (await db.get(getUserIdQuery)).user_id;
  const getTweetDetailsQuery = `select tweet.tweet as tweet,count(distinct like.like_id) as likes,count(distinct reply.reply_id) as replies,tweet.date_time as dateTime from ( tweet left join like on tweet.tweet_id=like.tweet_id ) left join reply on tweet.tweet_id=reply.tweet_id where tweet.user_id=${userID} group by tweet.tweet_id;`;
  const tweetDetails = await db.all(getTweetDetailsQuery);
  response.send(tweetDetails);
});

// API 10 - Create a Tweet

app.post("/user/tweets/", authenticateUser, async (request, response) => {
  const { tweet } = request.body;
  const { username } = request;
  const getUserIdQuery = `select user_id as user_id from user where username="${username}";`;
  const userID = (await db.get(getUserIdQuery)).user_id;
  const currentDate = new Date();
  const currentDateString = `${currentDate.getFullYear()}-${
    currentDate.getMonth() + 1
  }-${currentDate.getDate()} ${currentDate.getHours()}:${currentDate.getMinutes()}:${currentDate.getSeconds()}`;
  const createTweetQuery = `insert into tweet (tweet,user_id,date_time) values ("${tweet}",${userID},"${currentDateString}"`;
  await db.run(createTweetQuery);
  response.send("Created a Tweet");
});

// API 11 - Delete Tweet

app.delete("/tweets/:tweetId/", async (request, response) => {
  const { tweetId } = request.params;
  const { username } = request;
  const getUserIdQuery = `select user_id as user_id from user where username="${username}";`;
  const userID = (await db.get(getUserIdQuery)).user_id;
  const checkUserTweetOrNotQuery = `select * from tweet where tweet_id=${tweetId} and user_id=${userID}`;
  const isUsersTweet = await db.get(checkUserTweetOrNotQuery);
  if (isUsersTweet !== undefined) {
    const deleteTweetQuery = `delete from tweet where tweet_id=${tweetId};`;
    await db.run(deleteTweetQuery);
    response.send("Tweet Removed");
  } else {
    response.status(401);
    response.send("Invalid Request");
  }
});
