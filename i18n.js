// @ts-check
/** English source strings are lookup keys; page titles and URLs are never translated. */
/** @type {Record<string, string>} */
const russian = {
  "Demo · fictional tabs": "Демоверсия · вкладки для примера",
  "Quiet Tabs home": "Quiet Tabs — на главную",
  "Settings": "Настройки",
  "Language": "Язык",
  "Switch to Russian": "Переключить язык на русский",
  "Switch to English": "Переключить язык на английский",
  "Getting to know your tabs": "Наблюдение за вкладками",
  "Fewer tabs.": "Меньше вкладок.",
  "More focus.": "Легче сосредоточиться.",
  "Keep what matters close.": "Держите нужные вкладки под рукой.",
  "Let the forgotten tabs go.": "Находите те, которые больше не нужны.",
  "Tab statistics": "Статистика вкладок",
  "suggestions": "к проверке",
  "tracked": "всего вкладок",
  "protected": "под защитой",
  "Closing only with your approval": "Закрытие только по вашему решению",
  "Confirm a suggestion to save its link and close the tab. Nothing closes automatically. The archive saves links, not unsaved text.": "Кнопка «Согласен, закрыть» сохраняет ссылку в архив и закрывает предложенную вкладку. Автоматического закрытия нет. Архив сохраняет только ссылки, а не несохранённый текст.",
  "Observation started today. Earlier browsing time is unknown, so your tabs start with a full retention period.": "Наблюдение началось сегодня. Расширение не знает, когда вы пользовались вкладками раньше, поэтому срок до первой рекомендации отсчитывается с начала наблюдения.",
  "Tab lists": "Списки вкладок",
  "Suggestions": "Рекомендации",
  "Journal": "Журнал",
  "All": "Все",
  "Archive": "Архив",
  "Find a tab or site": "Найти вкладку или сайт",
  "Qualified": "Зачтено",
  "Qualified time: low to high. Click to show high to low.": "Зачтённое время: от меньшего к большему. Нажмите, чтобы показать от большего к меньшему.",
  "Qualified time: high to low. Click to show low to high.": "Зачтённое время: от большего к меньшему. Нажмите, чтобы показать от меньшего к большему.",
  "Choose ascending or descending order.": "Выберите сортировку по возрастанию или убыванию.",
  "Qualified when archived: {qualified}": "Зачтено при сохранении: {qualified}",
  "Qualified time was not recorded": "Зачтённое время не сохранено",
  "Tabs you have not revisited": "Вкладки, которыми вы давно не пользовались",
  "Your data stays in this browser.": "Данные остаются в этом браузере.",
  "FIT YOUR WORKFLOW": "НАСТРОЙТЕ ПОД СЕБЯ",
  "Make room for focus.": "Сосредоточьтесь на важном.",
  "Choose how long to keep tabs and when to review them.": "Выберите, сколько времени сохранять вкладки открытыми и когда предлагать их закрыть.",
  "Mode": "Режим работы",
  "Recommendations": "Рекомендации",
  "Agree to close a suggested tab and save its link. No automatic closing.": "Подтвердите рекомендацию, чтобы закрыть вкладку и сохранить ссылку. Автоматического закрытия нет.",
  "start here": "для начала",
  "Close automatically": "Закрывать автоматически",
  "Up to 5 tabs every 15 minutes. Links are archived.": "Не больше 5 вкладок каждые 15 минут. Ссылки сохраняются в архиве.",
  "The archive restores links, not unsaved text, navigation history or scroll position. Silent video calls may also go undetected.": "Из архива можно заново открыть страницу по ссылке. Несохранённый текст, история переходов и положение прокрутки не восстанавливаются. Расширение также может не распознать вкладку с видеозвонком, если она не воспроизводит звук.",
  "Exclude editors and meeting sites before enabling this mode. Automatic closing starts after a one-hour delay.": "Перед включением добавьте сайты с редакторами и видеозвонками в исключения. Автоматическое закрытие начнётся через час после включения режима.",
  "I understand that only links are saved": "Понимаю, что сохраняются только ссылки",
  "When a visit qualifies as attention": "Как учитывать время просмотра",
  "Quick scans do not make a tab more important. Separate short visits never add up to a qualifying visit.": "Просмотр учитывается, если вы остаётесь на вкладке не меньше указанного времени. Короткие посещения не складываются и не продлевают срок до рекомендации.",
  "Continuous visit": "Непрерывный просмотр",
  "In the focused Chrome window": "В активном окне Chrome",
  "Minimum continuous visit in seconds": "Минимальное время непрерывного просмотра в секундах",
  "s": "с",
  "min": "мин",
  "h": "ч",
  "d": "дн",
  "When to suggest a tab": "Когда предлагать закрытие",
  "Time since the last qualified visit. Tabs with more total qualified attention are kept longer. Brief scans appear in statistics but do not reset the clock.": "Срок отсчитывается с последнего просмотра, который длился не меньше заданного минимума. Чем больше времени набралось за такие просмотры, тем дольше вкладка остаётся открытой. Короткие посещения видны в статистике, но не продлевают срок.",
  "Barely viewed": "Почти не использовалась",
  "Less than 1 minute": "Меньше 1 минуты",
  "Retention hours for tabs with less than one minute of attention": "Срок до рекомендации в часах: учтено меньше минуты просмотра",
  "Read briefly": "Использовалась недолго",
  "1 to under 10 minutes": "От 1 до 10 минут, не включая 10",
  "Retention hours for tabs with one to under ten minutes of attention": "Срок до рекомендации в часах: учтено от 1 до 10 минут просмотра, не включая 10",
  "Used for work": "Использовалась долго",
  "10 minutes or more": "10 минут и больше",
  "Retention hours for tabs with ten or more minutes of attention": "Срок до рекомендации в часах: учтено 10 минут просмотра или больше",
  "Always keep these sites": "Не закрывать вкладки этих сайтов",
  "One domain per line, without https://. Subdomains are protected too.": "Укажите по одному домену в строке, без https://. Исключение действует и на его поддомены.",
  "Selected tabs in every window, pinned tabs, tabs playing audio and tabs marked Keep are protected. Attention is approximate: it is counted while Chrome is focused and your computer is not idle.": "Расширение не предлагает закрывать выбранную вкладку в каждом окне, закреплённые вкладки, вкладки со звуком и те, для которых вы нажали «Оставить». Время просмотра оценивается приблизительно: оно учитывается, пока окно Chrome активно и компьютер не находится в режиме бездействия.",
  "Save settings": "Сохранить настройки",
  "Back to tabs": "Вернуться к вкладкам",
  "Delete this archived link?": "Удалить ссылку из архива?",
  "You will no longer be able to restore it through Quiet Tabs.": "После удаления вы не сможете открыть эту ссылку из архива Quiet Tabs.",
  "Keep link": "Оставить ссылку",
  "Delete link": "Удалить ссылку",
  "Cannot reach the extension. Reload it at chrome://extensions.": "Не удалось связаться с расширением. Откройте chrome://extensions и нажмите кнопку перезагрузки на карточке Quiet Tabs.",
  "The action could not be completed.": "Не удалось выполнить действие.",
  "You agreed: this tab could be closed": "Ваша оценка: вкладку можно закрыть",
  "You marked this tab as needed": "Ваша оценка: вкладка ещё нужна",
  "You postponed this decision": "Вы отложили решение",
  "Agree & close": "Согласен, закрыть",
  "Needed": "Нужна",
  "Tomorrow": "Завтра",
  "Feedback saved. The matching open tab is now protected.": "Оценка сохранена. Если вкладка ещё открыта, она защищена от закрытия.",
  "Feedback saved. Snoozed for one day.": "Оценка сохранена. Если вкладка ещё открыта, рекомендация отложена на сутки.",
  "Total visible {visible} · qualified {qualified}": "Время просмотра: {visible} · учтено: {qualified}",
  "No qualified visit for {age}": "Без длительных просмотров: {age}",
  "Retain for {retention} without a qualified visit": "Срок без длительных просмотров: {retention}",
  "Unprotect": "Снять защиту",
  "Keep": "Оставить",
  "Protection removed.": "Защита снята.",
  "This tab is now protected from suggestions.": "Вкладка защищена. Рекомендаций закрыть её больше не будет.",
  "Snoozed for one day.": "Рекомендация отложена на сутки.",
  "Close ↘": "Закрыть ↘",
  "Tab closed. Its link was saved to the archive.": "Вкладка закрыта. Ссылка сохранена в архиве.",
  "Suggested after {age} without a visit of at least {seconds} s": "За {age} не было ни одного просмотра длительностью хотя бы {seconds} с подряд",
  "At the time: visible {visible}, qualified {qualified}": "На момент рекомендации: время просмотра — {visible}, из него учтено — {qualified}",
  "automatically": "автоматически",
  "manually": "вручную",
  "Link saved; closing was not confirmed": "Ссылка сохранена, но закрытие вкладки не подтверждено",
  "↗ Restore": "↗ Восстановить",
  "Tab restored in the background and protected for one day.": "Ссылка открыта в фоновой вкладке. Вкладка защищена от закрытия на сутки.",
  "to review": "к проверке",
  "Recommendations · you choose what to close": "Рекомендации · закрытие по вашему решению",
  "Automatic cleanup": "Автоматическое закрытие",
  "Journal: {count} · agreed: {agree} · needed: {keep}": "Рекомендации: {count} · можно закрыть: {agree} · ещё нужны: {keep}",
  "Visits qualify after {seconds} continuous seconds. Quick scans do not reset the clock.": "Учитываются просмотры от {seconds} с подряд. Более короткие посещения не продлевают срок до рекомендации.",
  "Automatic closing starts in about {time}. You can configure exclusions in the meantime.": "Автоматическое закрытие начнётся примерно через {time}. До этого вы можете настроить исключения.",
  "Automatic cleanup is on: up to 5 stale tabs every 15 minutes. Links are saved to the archive.": "Автоматическое закрытие включено: каждые 15 минут закрывается не больше 5 вкладок, которыми вы давно не пользовались. Ссылки сохраняются в архиве.",
  "Saved links · {count} / {limit}": "Ссылок в архиве: {count} из {limit}",
  "Suggestion history · latest {limit}": "История рекомендаций · до {limit} последних записей",
  "All standard web pages": "Все отслеживаемые вкладки",
  "Tabs suggested for review": "Вкладки, которые можно закрыть",
  "No results": "Ничего не найдено",
  "Let us observe first": "Рекомендаций пока нет",
  "The archive is empty": "Архив пока пуст",
  "No tabs to track yet": "Пока нет вкладок для наблюдения",
  "Everything has its place": "Нет рекомендаций к закрытию",
  "Try a different title or address.": "Попробуйте другое название или адрес.",
  "Recommendations and your feedback will appear here.": "Здесь появятся рекомендации и ваши оценки.",
  "Links saved before closing tabs appear here. Restore them at any time.": "Здесь появятся ссылки, сохранённые перед закрытием вкладок. Их можно открыть снова в любой момент.",
  "Open a standard web page. Chrome internal pages and incognito tabs are excluded.": "Откройте любую веб-страницу. Служебные страницы Chrome и вкладки в режиме инкогнито не учитываются.",
  "No stale tabs yet. With default settings, suggestions begin after one day of observation.": "Пока нет вкладок, которые пора предложить закрыть. При стандартных настройках первые рекомендации могут появиться через сутки наблюдения.",
  "Links are archived before closing. Your data stays in this browser.": "Перед закрытием вкладки её ссылка сохраняется в архиве. Данные хранятся только в этом браузере.",
  "Settings saved.": "Настройки сохранены.",
  "Link removed from the archive.": "Ссылка удалена из архива.",
  "Currently selected": "Выбрана в окне Chrome",
  "Pinned in Chrome": "Закреплена в Chrome",
  "Playing audio": "Воспроизводит звук",
  "Protected by Chrome": "Защищена браузером",
  "Split view": "Открыта в режиме разделённого экрана",
  "Page is loading": "Страница загружается",
  "You chose to keep this tab": "Защищена по вашему выбору",
  "Excluded site": "Сайт добавлен в исключения",
  "Snoozed": "Рекомендация отложена",
  "Grace period after restart": "Временная защита после перезапуска",
  "Unknown data version. Tab closing has been stopped.": "Неизвестная версия данных. Закрытие вкладок остановлено.",
  "Choose a mode.": "Выберите режим работы.",
  "Choose English or Russian.": "Выберите английский или русский язык.",
  "Enter retention periods from 1 to 2160 hours, in ascending order.": "Укажите сроки от 1 до 2160 часов. Каждый следующий срок должен быть не меньше предыдущего.",
  "The visit threshold must be a whole number from 5 to 120 seconds.": "Укажите минимальное время просмотра: целое число от 5 до 120 секунд.",
  "Enter up to 100 domains without https:// or paths, such as docs.google.com.": "Укажите не больше 100 доменов, например docs.google.com. Не добавляйте https:// и адреса отдельных страниц.",
  "Confirm that the archive saves links, not unsaved form content.": "Подтвердите, что понимаете: архив сохраняет только ссылки, а несохранённые данные в формах будут потеряны.",
  "The tab could not be closed.": "Не удалось закрыть вкладку.",
  "Automatic closing is not enabled.": "Автоматическое закрытие не включено.",
  "The tab has changed or is protected. Refresh the list.": "Состояние вкладки изменилось или она защищена от закрытия. Обновите список.",
  "The archive contains 500 links. Remove unused entries before closing more tabs.": "Архив заполнен: в нём 500 ссылок. Удалите ненужные ссылки, прежде чем закрывать другие вкладки.",
  "The tab changed and was left open. Its link was saved to the archive.": "Состояние вкладки изменилось, поэтому она осталась открытой. Ссылка сохранена в архиве.",
  "Unknown feedback value.": "Не удалось распознать оценку.",
  "This suggestion is no longer in the journal.": "Этой рекомендации больше нет в журнале.",
  "This suggestion no longer matches a tab ready to close. Refresh the list.": "Эта рекомендация больше не соответствует вкладке, готовой к закрытию. Обновите список.",
  "This tab has changed.": "Состояние вкладки изменилось. Обновите список.",
  "Link not found.": "Ссылка не найдена.",
  "Chrome did not confirm that the tab was restored.": "Chrome не подтвердил восстановление вкладки.",
  "Unknown action.": "Неизвестное действие.",
  "Quiet Tabs · {count} recommendations, close only with your approval": "Quiet Tabs · рекомендаций — {count}, закрытие только по вашему решению",
  "Quiet Tabs · {count} suggestions": "Quiet Tabs · рекомендаций: {count}"
};

/** @param {unknown} value @returns {import('./models.js').Language} */
export const normalizeLanguage = value => value === 'ru' ? 'ru' : 'en';

/** @param {import('./models.js').Language} language @param {string} source @param {Record<string, string|number>} [values] */
export function translate(language, source, values = {}) {
  const template = language === 'ru' ? (russian[source] ?? source) : source;
  return template.replace(/\{(\w+)\}/g, (match, key) => Object.hasOwn(values, key) ? String(values[key]) : match);
}

/** Capture static text once, before dynamic cards or user data are inserted. */
/** @param {Document} document */
export function bindDocumentTranslations(document) {
  /** @type {Array<{node: Node, source: string}>} */
  const text = [];
  const walker = document.createTreeWalker(document.documentElement, 4);
  let node;
  while ((node = walker.nextNode())) {
    if (node.textContent?.trim() && !['SCRIPT', 'STYLE'].includes(node.parentElement?.tagName || '')) {
      text.push({ node, source: node.textContent });
    }
  }
  const attributes = [...document.querySelectorAll('[title], [aria-label], [placeholder]')].flatMap(element =>
    ['title', 'aria-label', 'placeholder'].filter(name => element.hasAttribute(name))
      .map(name => ({ element, name, source: element.getAttribute(name) || '' })));
  /** @param {import('./models.js').Language} language */
  return language => {
    document.documentElement.lang = language;
    for (const item of text) {
      if (item.node.isConnected) {
        item.node.textContent = item.source.replace(/\S[\s\S]*\S|\S/, value => translate(language, value));
      }
    }
    for (const item of attributes) item.element.setAttribute(item.name, translate(language, item.source));
  };
}
