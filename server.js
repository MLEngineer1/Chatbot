const express = require("express");
const { google } = require("googleapis");
const bodyParser = require("body-parser");
const dotenv = require("dotenv");

dotenv.config();

const app = express();
app.use(bodyParser.json());

const PORT = process.env.PORT || 3000;

// Load Google Calendar API credentials
const auth = new google.auth.JWT(
  process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
  null,
  process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, "\n"),
  ["https://www.googleapis.com/auth/calendar"]
);

const calendar = google.calendar({ version: "v3", auth });

// ✅ Endpoint to check if server is running
app.get("/", (req, res) => {
  res.send("Google Calendar Webhook is running!");
});

// ✅ Get free time slots
app.get("/free-slots", async (req, res) => {
  try {
    const { date } = req.query; // e.g., "2025-02-15"
    if (!date) return res.status(400).send({ error: "Date is required" });

    const startOfDay = new Date(`${date}T00:00:00Z`);
    const endOfDay = new Date(`${date}T23:59:59Z`);

    const response = await calendar.freebusy.query({
      requestBody: {
        timeMin: startOfDay.toISOString(),
        timeMax: endOfDay.toISOString(),
        items: [{ id: process.env.CALENDAR_ID }],
      },
    });

    const busySlots = response.data.calendars[process.env.CALENDAR_ID].busy;

    // Calculate free slots
    const freeSlots = [];
    let lastEnd = startOfDay;

    for (const slot of busySlots) {
      const busyStart = new Date(slot.start);
      if (lastEnd < busyStart) freeSlots.push({ start: lastEnd, end: busyStart });
      lastEnd = new Date(slot.end);
    }

    if (lastEnd < endOfDay) freeSlots.push({ start: lastEnd, end: endOfDay });

    res.json(freeSlots);
  } catch (error) {
    console.error("Error fetching free slots:", error);
    res.status(500).send({ error: "Internal server error" });
  }
});

// ✅ Schedule an appointment
app.post("/schedule", async (req, res) => {
  try {
    const { summary, description, start, end, email } = req.body;

    if (!summary || !start || !end || !email) {
      return res.status(400).send({ error: "Missing required fields" });
    }

    const event = {
      summary,
      description,
      start: { dateTime: start, timeZone: "UTC" },
      end: { dateTime: end, timeZone: "UTC" },
      attendees: [{ email }],
    };

    const response = await calendar.events.insert({
      calendarId: process.env.CALENDAR_ID,
      requestBody: event,
    });

    res.json({ success: true, eventId: response.data.id });
  } catch (error) {
    console.error("Error scheduling event:", error);
    res.status(500).send({ error: "Internal server error" });
  }
});

// ✅ Start server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

