# Webview Message Contracts

## Envelope

``` json
{
  "id":"uuid",
  "type":"Recorder.Start",
  "timestamp":"ISO8601",
  "payload":{}
}
```

## Principles

-   Version every message.
-   Correlation IDs required.
-   Never expose secrets.
-   Responses are asynchronous.

Core Messages - Recorder.Start - Recorder.Stop - Inspector.Highlight -
Run.Execute - Report.Open
