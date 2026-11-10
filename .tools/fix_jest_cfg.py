import io, json

p = r"B:\B\tax-app\apps\api\test\jest-e2e.json"
raw = io.open(p, encoding="utf-8-sig", newline="").read()
nl = "\r\n" if "\r\n" in raw else "\n"
cfg = json.loads(raw)

ts = cfg["transform"]["^.+\\.tsx?$"][1]
# ts-jest replaces the whole compilerOptions block when `tsconfig` is an object,
# so the jest globals were never typed and every e2e suite failed to compile
# before running a single assertion.
ts["tsconfig"] = {
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "target": "ES2022",
    "experimentalDecorators": True,
    "emitDecoratorMetadata": True,
    "esModuleInterop": True,
    "skipLibCheck": True,
    "strict": True,
    "strictNullChecks": True,
    "noImplicitAny": False,
    "types": ["node", "jest"],
}

io.open(p, "w", encoding="utf-8", newline=nl).write(json.dumps(cfg, indent=2) + nl)
print("ok")
