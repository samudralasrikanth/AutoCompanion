# Extension Lifecycle

## Startup

1.  activate()
2.  Load configuration
3.  Register dependency container
4.  Register commands
5.  Register tree views
6.  Register webviews
7.  Initialize event bus
8.  Restore workspace state

## Shutdown

-   Dispose subscriptions
-   Flush logs
-   Save workspace state
-   Close framework processes
