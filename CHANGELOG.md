# CHANGELOG

## 2026-10-04
- GitHub подключён, отдельная ветка codex/configurator-review.
- Исправлены Cu ширины, плечи углов, прямоугольные стояки.
- Подписи/экспорт DPR, белый фон PNG, узкая раскладка.
- IP суффиксы, заглушки и крепёж HF; неизвестный1200 остаётся явным.
- 9 targeted checks; контрольный рисунок и PNG в браузере.
- BOM/тариф/механические детали и будущие трассы: docs/REVIEW.md.

### UI/EDGE итерация
- Нормальный ввод длины, focus preventScroll, popup внутри viewer.
- Wheel/pan/zoom bounds, pointercancel, подавление click после drag; desktop sticky viewer.
- Global EDGE/FLAT в UI и сохранении: геометрия, LF/LE, HE/HF.
- Локальный preview теперь копия приложения без нижнего PNG и без сброса трасс.
-12 целевых checks PASS; браузер:3500мм, EDGE reload, wheel/pan без page scroll.
