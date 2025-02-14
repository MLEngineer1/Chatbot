const express = require("express");
const { google } = require("googleapis");
const bodyParser = require("body-parser");
require("dotenv").config();

const app = express();
app.use(bodyParser.json());

const calendar = google.calendar({ version: "v3" });

// Authenticate with Google
const auth = new google.auth.JWT(
    process.env.CLIENT_EMAIL,
    null,
    process.env.PRIVATE_KEY.replace(/\\n/g, "\n"),
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
            items: [{ id: process.env.CALENDAR_ID }],
        },
    });

    const busySlots = res.data.calendars[process.env.CALENDAR_ID].busy;
    let freeSlots = [];

    let current = new Date(startTime);
    let end = new Date(endTime);

    while (current < end) {
        let nextSlot = new Date(current);
        nextSlot.setMinutes(current.getMinutes() + 30);

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
        calendarId: process.env.CALENDAR_ID,
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
        
        res.json({ fulfillmentText: freeSlots.length > 0 
            ? `Available slots: ${freeSlots.join(", ")}` 
            : "No available slots." 
        });

    } else if (intent === "BookAppointment") {
        const { startTime, endTime, summary } = req.body.queryResult.parameters;
        await scheduleEvent(startTime, endTime, summary);
        
        res.json({ fulfillmentText: `✅ Appointment confirmed for ${summary} on ${startTime}` });
    }
});

// Start Express server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Webhook running on port ${PORT}`));

