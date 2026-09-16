require("dotenv").config();

const axios = require("axios");

async function testNyckel() {
  try {
    const body = new URLSearchParams({
      grant_type: "client_credentials",
      client_id: process.env.NYCKEL_CLIENT_ID.trim(),
      client_secret: process.env.NYCKEL_CLIENT_SECRET.trim(),
    });

    const response = await axios.post(
      "https://www.nyckel.com/connect/token",
      body,
      {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
      }
    );

    console.log("Nyckel authentication successful!");
    console.log("Token received:", !!response.data.access_token);
  } catch (error) {
    console.log(
      "Nyckel authentication failed:",
      error.response?.data || error.message
    );
  }
}

testNyckel();
