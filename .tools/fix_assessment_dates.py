import io

p = r"B:\B\tax-app\apps\web\src\components\AssessmentView.tsx"
raw = io.open(p, encoding="utf-8-sig", newline="").read()
nl = "\r\n" if "\r\n" in raw else "\n"
s = raw.replace("\r\n", "\n")

old = """    } else if (res.data) {
      setAssessment(res.data);
      showFeedback('success', 'Official ACD Bulletin imported & discrepancy reconciliation generated!');
      onRefresh();
    }"""

new = """    } else if (res.data) {
      setAssessment(res.data);
      // The follow-up fields are separate state, filled only by the initial
      // load. Without this the freshly computed objection deadline and
      // follow-up date stayed blank until the page was reloaded.
      setObjectionDeadline(toDateInputValue(res.data.objectionDeadline));
      setFollowUpAt(toDateInputValue(res.data.followUpAt));
      showFeedback('success', 'Official ACD Bulletin imported & discrepancy reconciliation generated!');
      onRefresh();
    }"""

assert s.count(old) == 1, s.count(old)
s = s.replace(old, new)
io.open(p, "w", encoding="utf-8", newline="").write(s.replace("\n", nl))
print("ok")
