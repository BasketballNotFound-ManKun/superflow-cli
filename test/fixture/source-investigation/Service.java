class Service {
  @Transactional void retry(String id) {
    mapper.fillMetadata(id);
    guard.claimInNewTransaction(id);
    client.start(id);
  }
  void settle(Record prepared) {
    Record actual = mapper.lockAndRead(prepared.id);
    actual.setStatus(prepared.status);
    mapper.save(actual);
    publisher.publish(actual);
  }
  void normalize(String id) {
    if (mapper.setZero(id) == 0) return;
    settle(new Record(id, 0));
  }
}
