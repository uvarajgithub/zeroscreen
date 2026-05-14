content = open('/root/zeroscreen/dist/server.js', encoding='utf-8').read()
idx_start = content.find("        res.send(`<!DOCTYPE html>\n<html lang=\"en\">\n<head>\n  <meta charset=\"UTF-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\">\n  <title>Live Bot Dashboard")
print("idx_start:", idx_start)
search_from = idx_start + 100
end_marker = "</html>`);\n        return;"
idx_end = content.find(end_marker, search_from)
print("idx_end:", idx_end)
if idx_end != -1:
    print("end context:", repr(content[idx_end-30:idx_end+50]))
