const express = require("express");
const { google } = require("googleapis");
const bodyParser = require("body-parser");

const app = express();
app.use(bodyParser.json());

const calendar = google.calendar({ version: "v3" });

// Load OAuth credentials
const API_CREDENTIALS = require("./credentials.json");

// Authenticate with Google
const auth = new google.auth.JWT(
    API_CREDENTIALS.client_email,
    null,
    API_CREDENTIALS.private_key,
    ["https://www.googleapis.com/auth/calendar"]
);

// 🕒 Function to Get Free Slots
async function getFreeSlots(startTime, endTime) {
    const res = await calendar.freebusy.query({
        auth,
        requestBody: {
            timeMin: startTime,
            timeMax: endTime,
            timeZone: "UTC",
            items: [{ id: "your_calendar_id@gmail.com" }],
        },
    });

    const busySlots = res.data.calendars["your_calendar_id@gmail.com"].busy;
    let freeSlots = [];

    let current = new Date(startTime);
    let end = new Date(endTime);

    while (current < end) {
        let nextSlot = new Date(current);
        nextSlot.setMinutes(current.getMinutes() + 30); // Assuming 30-min slots

        if (!busySlots.some(slot => 
            new Date(slot.start) < nextSlot && new Date(slot.end) > current
        )) {
            freeSlots.push(current.toISOString());
        }

        current = nextSlot;
    }

    return freeSlots;
}

// 📅 Function to Schedule an Event
async function scheduleEvent(startTime, endTime, summary) {
    const event = {
        summary,
        start: { dateTime: startTime, timeZone: "UTC" },
        end: { dateTime: endTime, timeZone: "UTC" },
    };

    const response = await calendar.events.insert({
        auth,
        calendarId: "your_calendar_id@gmail.com",
        requestBody: event,
    });

    return response.data;
}

// 🎤 Dialogflow Webhook Handler
app.post("/webhook", async (req, res) => {
    const intent = req.body.queryResult.intent.displayName;

    if (intent === "CheckAvailability") {
        const { startTime, endTime } = req.body.queryResult.parameters;
        const freeSlots = await getFreeSlots(startTime, endTime);
        
        if (freeSlots.length === 0) {
            res.json({ fulfillmentText: "No available slots in that time range." });
        } else {
            res.json({ fulfillmentText: `Available slots: ${freeSlots.join(", ")}` });
        }

    } else if (intent === "BookAppointment") {
        const { startTime, endTime, summary } = req.body.queryResult.parameters;
        const event = await scheduleEvent(startTime, endTime, summary);
        
        res.json({ fulfillmentText: `✅ Appointment confirmed for ${summary} on ${startTime}` });
    }
});

// Start Express server
app.listen(3000, () => console.log("Webhook running on port 3000"));
