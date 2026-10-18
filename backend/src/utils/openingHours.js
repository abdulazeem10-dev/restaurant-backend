const WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

function getIndiaDayAndMinute(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata",
    weekday: "long",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23"
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return {
    day: values.weekday.toLowerCase(),
    minute: Number(values.hour) * 60 + Number(values.minute)
  };
}

function isWithinOpeningHours(openingHours, date = new Date()) {
  if (!openingHours) return true;
  const { day, minute } = getIndiaDayAndMinute(date);
  const hours = openingHours[day];
  if (!hours || hours.closed) return false;
  const toMinutes = value => {
    if (typeof value !== "string" || !/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) return null;
    const [hour, minutes] = value.split(":").map(Number);
    return hour * 60 + minutes;
  };
  const start = toMinutes(hours.opensAt);
  const end = toMinutes(hours.closesAt);
  return start !== null && end !== null && end > start && minute >= start && minute < end;
}

function isRestaurantOpenNow(restaurant, date = new Date()) {
  return Boolean(restaurant.isOpen && isWithinOpeningHours(restaurant.openingHours, date));
}

module.exports = { WEEKDAYS, isWithinOpeningHours, isRestaurantOpenNow };
