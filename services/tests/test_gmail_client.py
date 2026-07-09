from clients import gmail_client


class FakeSend:
    def __init__(self, calls):
        self._calls = calls

    def execute(self):
        self._calls.append("executed")


class FakeMessages:
    def __init__(self, calls):
        self._calls = calls

    def send(self, userId, body):
        self._calls.append({"userId": userId, "body": body})
        return FakeSend(self._calls)


class FakeUsers:
    def __init__(self, calls):
        self._calls = calls

    def messages(self):
        return FakeMessages(self._calls)


class FakeGmailService:
    def __init__(self):
        self.calls = []

    def users(self):
        return FakeUsers(self.calls)


def test_send_raw_via_gmail_sends_as_the_authenticated_user():
    service = FakeGmailService()
    send_raw = gmail_client.send_raw_via_gmail(service)

    send_raw("encoded-raw-message")

    assert service.calls[0] == {"userId": "me", "body": {"raw": "encoded-raw-message"}}
    assert service.calls[1] == "executed"
