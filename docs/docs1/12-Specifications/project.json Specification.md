# project.json Specification

``` json
{
  "projectId":"uuid",
  "projectName":"Bloomberg_Trading",
  "projectType":"vision",
  "frameworkVersion":"1.0",
  "pythonVersion":"3.11",
  "addons":["db","api"],
  "createdAt":"ISO8601"
}
```

## Validation

-   projectId immutable
-   projectType: vision\|desktop\|playwright\|mainframe
-   Semantic versioning required.
