# Service Interfaces

interface RecorderService{ start(); pause(); stop(); export(); }

interface RunnerService{ runScenario(); debugScenario(); cancel(); }

interface InspectorService{ inspect(); highlight(); capture(); }
