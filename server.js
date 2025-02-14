const express = require("express");
const { google } = require("googleapis");
const bodyParser = require("body-parser");
const dotenv = require("dotenv");
const cors = require("cors");

dotenv.config();

const app = express();
app.use(cors());
app.use(bodyParser.json());

const SCOPES = ["https://www.googleapis.com/auth/calendar"];
const calendar = google.calendar({ version: "v3" });

// Authenticate with Google
const auth = new google.auth.JWT(
  process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
  null,
  process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, "\n"), // Fix for Render
  SCOPES
);

/**
 * ✅ GET available time slots
 */
app.get("/free-slots", async (req, res) => {
  try {
    const { date } = req.query; // Format: YYYY-MM-DD
    if (!date) return res.status(400).json({ error: "Date is required" });

    const start = new Date(date + "T00:00:00Z");
    const end = new Date(date + "T23:59:59Z");

    const { data } = await calendar.events.list({
      auth,
      calendarId: process.env.CALENDAR_ID,
      timeMin: start.toISOString(),
      timeMax: end.toISOString(),
      singleEvents: true,
      orderBy: "startTime",
    });

    const events = data.items.map((event) => ({
      start: event.start.dateTime || event.start.date,
      end: event.end.dateTime || event.end.date,
    }));

    res.json({ events });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * ✅ POST to schedule an appointment
 */
app.post("/schedule", async (req, res) => {
  try {
    const { summary, description, start, end, email } = req.body;
    if (!summary || !start || !end || !email)
      return res.status(400).json({ error: "Missing required fields" });

    const event = {
      summary,
      description,
      start: { dateTime: start, timeZone: "UTC" },
      end: { dateTime: end, timeZone: "UTC" },
      attendees: [{ email }],
    };

    await calendar.events.insert({
      auth,
      calendarId: process.env.CALENDAR_ID,
      resource: event,
    });

    res.json({ message: "Appointment scheduled successfully!" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * ✅ Dialogflow Webhook
 */
app.post("/webhook", async (req, res) => {
  const intent = req.body.queryResult.intent.displayName;

  if (intent === "CheckAvailability") {
    const date = req.body.queryResult.parameters.date;
    const response = await fetch(
      `https://yourapp.onrender.com/free-slots?date=${date}`
    );
    const { events } = await response.json();

    res.json({
      fulfillmentText: `Available slots: ${events
        .map((e) => `${e.start} to ${e.end}`)
        .join(", ")}`,
    });
  } else if (intent === "BookAppointment") {
    const { summary, start, end, email } = req.body.queryResult.parameters;
    await fetch("https://yourapp.onrender.com/schedule", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ summary, start, end, email }),
    });

    res.json({ fulfillmentText: "Appointment booked successfully!" });
  } else {
    res.json({ fulfillmentText: "Sorry, I didn't understand." });
  }
});

/**
