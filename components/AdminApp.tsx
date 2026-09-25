"use client";
import { useEffect, useState } from "react";
import {
  Admin, Resource, List, Datagrid, TextField, DateField, UrlField, FunctionField,
  Create, Edit, Show, SimpleForm, TextInput, SelectInput, required, Toolbar, SaveButton,
  TopToolbar, CreateButton, ShowButton, EditButton, useRecordContext, useNotify,
  useRefresh, useGetList, Title, defaultTheme,
} from "react-admin";
import { Box, Button, Card, CardContent, Chip, Typography, Stack, Alert, Dialog, DialogTitle, DialogContent, DialogActions } from "@mui/material";
import ArticleIcon from "@mui/icons-material/Article";
import LanguageIcon from "@mui/icons-material/Language";
import polyglotI18nProvider from "ra-i18n-polyglot";
import russianMessages from "ra-language-russian";
import Markdown from "react-markdown";
import dataProvider, { api } from "./dataProvider";
import type { Article } from "@/lib/article";

const labels = { draft: "Черновик", approved: "Одобрено", deploying: "Публикуется", published: "Опубликовано", failed: "Нужна проверка" };
const statusChoices = Object.entries(labels).map(([id, name]) => ({ id, name }));
const covers = [
  { id: "/images/hero.webp", name: "Главная композиция" },
  ...["Розовые розы", "Белые цветы", "Бордовые георгины", "Персиковые розы", "Сиреневый букет", "Жёлтые цветы"].map((name, i) => ({ id: `/images/arrangement-${i + 1}.webp`, name })),
];
const i18n = polyglotI18nProvider(() => russianMessages, "ru");
const theme = { ...defaultTheme, palette: { ...defaultTheme.palette, primary: { main: "#2e5546" }, secondary: { main: "#a47755" }, background: { default: "#f5f6f3", paper: "#fff" } }, shape: { borderRadius: 10 }, typography: { fontFamily: "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" } };

function Status() {
  const record = useRecordContext<Article>();
  return record ? <Chip size="small" label={labels[record.status]} color={record.status === "published" ? "success" : record.status === "failed" ? "warning" : "default"} /> : null;
}
function Dashboard() {
  const { data = [] } = useGetList<Article>("articles", { pagination: { page: 1, perPage: 1000 }, sort: { field: "updatedAt", order: "DESC" }, filter: {} });
  return <Box p={{ xs: 1, md: 3 }}>
    <Title title="Inspirovate · Контент" />
    <Typography variant="overline" color="text.secondary">ЛОКАЛЬНАЯ АДМИНКА · ПИЛОТ</Typography>
    <Typography variant="h3" sx={{ mt: 1, mb: 2, fontWeight: 650 }}>От идеи до публикации</Typography>
    <Typography color="text.secondary" sx={{ maxWidth: 650, mb: 3 }}>Подготовьте статью, проверьте текст и обложку, затем отправьте на сайт. Здесь виден результат каждого шага.</Typography>
    <Stack direction={{ xs: "column", md: "row" }} spacing={2} mb={3}>
      {[{ label: "Черновики", count: data.filter(a => a.status === "draft").length }, { label: "Готовы к публикации", count: data.filter(a => a.status === "approved").length }, { label: "Проверены на сайте", count: data.filter(a => a.status === "published").length }].map(item => <Card key={item.label} sx={{ flex: 1 }}><CardContent><Typography color="text.secondary">{item.label}</Typography><Typography variant="h3" mt={1}>{item.count}</Typography></CardContent></Card>)}
    </Stack>
    <Card><CardContent sx={{ p: 3 }}><Chip label="Первый клиентский сайт" size="small" /><Typography variant="h5" mt={2}>Petal &amp; Stem</Typography><Typography color="text.secondary" mt={1} mb={2}>Сайт работает на Netlify. Приём заявки и email проверены владельцем.</Typography><Stack direction="row" gap={2} flexWrap="wrap"><Button variant="contained" href="#/articles/create">Новая статья</Button><Button href="#/articles">Все статьи</Button><Button href="https://flowerslih.netlify.app" target="_blank" rel="noreferrer">Открыть сайт ↗</Button></Stack></CardContent></Card>
    <Alert severity="info" sx={{ mt: 3 }}>Черновики хранятся на этом Mac. Автопубликация и AI пока не подключены. Счётчик включает только статьи, опубликованные через эту админку.</Alert>
  </Box>;
}
function ArticleList() {
  return <List title="Статьи" sort={{ field: "updatedAt", order: "DESC" }} filters={[<TextInput key="q" source="q" label="Поиск по заголовку" alwaysOn />, <SelectInput key="status" source="status" label="Статус" choices={statusChoices} />]} actions={<TopToolbar><CreateButton label="Новая статья" /></TopToolbar>}>
    <Datagrid rowClick="show" bulkActionButtons={false}>
      <TextField source="title" label="Заголовок" /><TextField source="slug" label="Адрес" />
      <FunctionField label="Статус" render={() => <Status />} />
      <DateField source="updatedAt" label="Обновлено" locales="ru-RU" showTime /><ShowButton label="Проверить" />
    </Datagrid>
  </List>;
}
function SaveToolbar() { return <Toolbar><SaveButton label="Сохранить черновик" /></Toolbar>; }
function Fields() {
  return <>
    <Alert severity="info" sx={{ mb: 2 }}>Текст сайта — на английском. После сохранения откройте предпросмотр и одобрите текущую версию.</Alert>
    <TextInput source="title" label="Заголовок" validate={required()} fullWidth />
    <TextInput source="slug" label="Адрес статьи (slug)" helperText="Например: flowers-for-a-dinner-table" validate={required()} fullWidth />
    <TextInput source="description" label="Краткое описание для поиска" multiline validate={required()} fullWidth />
    <TextInput source="publishedAt" label="Дата статьи (ISO, с часовым поясом)" helperText="Например: 2026-09-25T09:00:00Z. Будущие даты пока не публикуются автоматически." validate={required()} fullWidth />
    <SelectInput source="coverImage" label="Обложка из библиотеки сайта" choices={covers} validate={required()} fullWidth />
    <TextInput source="coverAlt" label="Описание изображения (alt)" validate={required()} fullWidth />
    <TextInput source="body" label="Текст статьи (Markdown)" multiline minRows={15} validate={required()} fullWidth helperText="## Подзаголовок · **выделение** · [ссылка](/flowers). HTML не отображается." />
  </>;
}
function ArticleCreate() {
  return <Create title="Новая статья" redirect="show"><SimpleForm defaultValues={() => ({ publishedAt: new Date().toISOString(), coverImage: "/images/hero.webp" })} toolbar={<SaveToolbar />}><Fields /></SimpleForm></Create>;
}
function EditForm() {
  const article = useRecordContext<Article>();
  if (article?.commit || article?.status === "deploying") return <Alert severity="info" sx={{ m: 3 }}>Эта версия уже отправлена на сайт и зафиксирована. Изменение опубликованных статей добавим на следующем этапе.</Alert>;
  return <SimpleForm toolbar={<SaveToolbar />}><Fields /></SimpleForm>;
}
function ArticleEdit() { return <Edit title="Редактирование черновика" mutationMode="pessimistic" redirect="show" actions={<TopToolbar><ShowButton label="Предпросмотр" /></TopToolbar>}><EditForm /></Edit>; }
function Preview() {
  const article = useRecordContext<Article>(); const notify = useNotify(); const refresh = useRefresh();
  const [busy, setBusy] = useState(false); const [confirm, setConfirm] = useState(false);
  useEffect(() => {
    if (!article || article.status !== "deploying") return;
    const timeout = setTimeout(() => {
      api(`/api/articles/${article.id}/verify`, "POST", { revision: article.revision }).then(refresh).catch(() => { /* Manual retry stays available. */ });
    }, 20000);
    return () => clearTimeout(timeout);
  }, [article, refresh]);
  if (!article) return null;
  const action = async (name: string) => {
    setBusy(true); setConfirm(false);
    try {
      const { data } = await api(`/api/articles/${article.id}/${name}`, "POST", { revision: article.revision });
      notify(data.status === "failed" ? data.error : name === "approve" ? "Версия одобрена" : name === "publish" ? "Статья отправлена. Ожидаем публикацию на сайте." : data.status === "published" ? "Публикация подтверждена" : data.error || "Проверка завершена", { type: data.status === "failed" ? "warning" : "info" });
      refresh();
    } catch (e) { notify((e as Error).message, { type: "error" }); }
    finally { setBusy(false); }
  };
  return <Box p={{ xs: 2, md: 4 }}>
    <Stack direction="row" spacing={2} alignItems="center" mb={2}><Status /><Typography color="text.secondary">Версия {article.revision} · Petal &amp; Stem</Typography></Stack>
    <Stack direction="row" gap={1} flexWrap="wrap" mb={3}>
      {!article.commit && article.status !== "deploying" && <EditButton label="Редактировать" />}
      {(article.status === "draft" || (article.status === "failed" && !article.commit)) && <Button disabled={busy} onClick={() => action("approve")}>Одобрить эту версию</Button>}
      {(article.status === "approved" || article.status === "failed") && article.approvedHash && <Button variant="contained" disabled={busy} onClick={() => setConfirm(true)}>{article.commit ? "Повторить отправку" : "Опубликовать на сайте"}</Button>}
      {article.commit && article.status !== "published" && <Button disabled={busy} onClick={() => action("verify")}>Проверить публикацию</Button>}
      {article.status === "published" && <Button href={`https://flowerslih.netlify.app/blog/${article.slug}`} target="_blank" rel="noreferrer">Открыть статью ↗</Button>}
    </Stack>
    {article.status === "deploying" && <Alert severity="info" sx={{ mb: 2 }}>Ожидаем Netlify. Проверка выполняется каждые 20 секунд, пока открыта эта страница.</Alert>}
    {article.error && <Alert severity={article.status === "failed" ? "warning" : "info"} sx={{ mb: 2 }}>{article.error}</Alert>}
    {article.commit && <Typography variant="body2" color="text.secondary" mb={2}>Коммит: <a href={`https://github.com/List-In-Hive/flowers_test/commit/${article.commit}`} target="_blank" rel="noreferrer">{article.commit.slice(0, 7)}</a>{article.deployId && ` · Деплой: ${article.deployId}`}</Typography>}
    <Card variant="outlined"><CardContent sx={{ p: { xs: 2, md: 4 } }}><article className="article-preview">
      <Typography variant="overline">ПРЕДПРОСМОТР · {new Date(article.publishedAt).toLocaleDateString("ru-RU")}</Typography>
      <h1>{article.title}</h1><p>{article.description}</p>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className="article-cover" src={`https://flowerslih.netlify.app${article.coverImage}`} alt={article.coverAlt} />
      <Markdown skipHtml components={{ a: ({ href, children }) => <a href={href?.startsWith("/") ? `https://flowerslih.netlify.app${href}` : href} target="_blank" rel="noreferrer">{children}</a> }}>{article.body}</Markdown>
    </article></CardContent></Card>
    <Dialog open={confirm} onClose={() => setConfirm(false)}><DialogTitle>Опубликовать статью?</DialogTitle><DialogContent>«{article.title}» будет отправлена в GitHub и появится на flowerslih.netlify.app после успешной сборки.</DialogContent><DialogActions><Button onClick={() => setConfirm(false)}>Отмена</Button><Button variant="contained" onClick={() => action("publish")}>Опубликовать</Button></DialogActions></Dialog>
  </Box>;
}
function ArticleShow() { return <Show title="Проверка статьи" actions={false}><Preview /></Show>; }
function SiteList() { return <List title="Сайты" pagination={false} actions={false}><Datagrid bulkActionButtons={false}><TextField source="name" label="Сайт" /><UrlField source="url" label="Адрес" target="_blank" /><TextField source="repository" label="Репозиторий" /><TextField source="branch" label="Ветка" /></Datagrid></List>; }

export default function AdminApp() {
  return <Admin title="Inspirovate" dashboard={Dashboard} dataProvider={dataProvider} i18nProvider={i18n} theme={theme} darkTheme={null} disableTelemetry>
    <Resource name="articles" options={{ label: "Статьи" }} icon={ArticleIcon} list={ArticleList} create={ArticleCreate} edit={ArticleEdit} show={ArticleShow} recordRepresentation="title" />
    <Resource name="sites" options={{ label: "Сайты" }} icon={LanguageIcon} list={SiteList} />
  </Admin>;
}
