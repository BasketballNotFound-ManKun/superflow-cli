class Publisher { void publish(Record r) {
  try { client.send(r); } catch (Exception e) { log.warn(e); }
} }
