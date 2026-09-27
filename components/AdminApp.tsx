"use client";
import Projects from "./Projects";
import { ProjectCatalog,useCatalog } from "./ProjectCatalog";
import Knowledge from "./Knowledge";
import Library from "./Library";
import ArticlePreparation from "./ArticlePreparation";
import BlogThumbnail from "./BlogThumbnail";
import { useEffect, useState } from "react";
import {
  Admin, Resource, List, Datagrid, TextField, DateField, FunctionField,
  Create, Edit, Show, SimpleForm, TextInput, SelectInput, required, Toolbar, SaveButton,
  TopToolbar, CreateButton, ShowButton, EditButton, useRecordContext, useNotify,
  useRefresh, useGetList, Title, defaultTheme, CustomRoutes, Layout, Menu, type LayoutProps,
} from "react-admin";
import { Box, Button, Card, CardContent, Chip, Typography, Stack, Alert, Dialog, DialogTitle, DialogContent, DialogActions } from "@mui/material";
import Schedule from "./Schedule";
import AIRewrite from "./AIRewrite";
import { Route } from "react-router";
import { projectPath } from "@/lib/projects";
import { ProjectFrame, useProject } from "./ProjectContext";
import AIGenerator from "./AIGenerator";
import Integrations from "./Integrations";


import ArticleIcon from "@mui/icons-material/Article";
import LanguageIcon from "@mui/icons-material/Language";
import Markdown from "react-markdown";
import dataProvider from "./dataProvider";
import type { Article } from "@/lib/article";

const labels = { draft: "Draft", approved: "Approved", deploying: "Publishing", published: "Published", failed: "Needs attention" };
const statusChoices = Object.entries(labels).map(([id, name]) => ({ id, name }));
const theme = { ...defaultTheme, palette: { ...defaultTheme.palette, primary: { main: "#2e5546" }, secondary: { main: "#a47755" }, background: { default: "#f5f6f3", paper: "#fff" } }, shape: { borderRadius: 10 }, typography: { fontFamily: "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" } };

function Status() {
  const record = useRecordContext<Article>();
  return record ? <Chip size="small" label={labels[record.status]} color={record.status === "published" ? "success" : record.status === "failed" ? "warning" : "default"} /> : null;
}
function ProjectOverview() {
  const {project,base}=useProject();
  const { data = [] } = useGetList<Article>(`projects/${project.id}/articles`, { pagination: { page: 1, perPage: 1000 }, sort: { field: "updatedAt", order: "DESC" }, filter: {} });
  return <Box p={{xs:2,md:3}}><Title title={`${project.name} · Overview`} />
    <Typography variant="h5" mb={2}>Content overview</Typography>
    <Stack direction={{xs:'column',md:'row'}} spacing={2} mb={3}>
      {[{label:'Drafts',count:data.filter(a=>a.status==='draft').length},{label:'Ready to publish',count:data.filter(a=>a.status==='approved').length},{label:'Verified on the website',count:data.filter(a=>a.status==='published').length}].map(item=><Card key={item.label} sx={{flex:1}}><CardContent><Typography color="text.secondary">{item.label}</Typography><Typography variant="h3" mt={1}>{item.count}</Typography></CardContent></Card>)}
    </Stack>
    <Stack direction="row" gap={2} flexWrap="wrap"><Button variant="contained" href={`#${base}/calendar`}>Publication calendar</Button><Button href={`#${base}/generate`}>Create with AI</Button><Button href={`#${base}/articles/create`}>Write manually</Button></Stack>
    <Alert severity="info" sx={{mt:3}}>Scheduled articles publish the latest saved version at their assigned time. Review drafts and adjust dates in this project’s calendar.</Alert>
  </Box>;
}
function ProjectMenu() { const projects=useCatalog().projects.filter(p=>!p.archivedAt);return <Menu><Menu.Item to="/projects" primaryText="Projects" leftIcon={<LanguageIcon />} />{projects.map(project=><Menu.Item key={project.id} to={projectPath(project.id)} primaryText={project.name} leftIcon={<ArticleIcon />} />)}</Menu>; }
function ProjectLayout(props:LayoutProps) { return <Layout {...props} menu={ProjectMenu} />; }
function MissingPage() { return <Box p={4}><Typography variant="h5">Select a project</Typography><Button href="#/projects">All projects</Button></Box>; }
function ArticleList() {
  return <List title="Articles" sort={{ field: "updatedAt", order: "DESC" }} filters={[<TextInput key="q" source="q" label="Search by title" alwaysOn />, <SelectInput key="status" source="status" label="Status" choices={statusChoices} />]} actions={<TopToolbar><CreateButton label="New article" /></TopToolbar>}>
    <Datagrid rowClick="show" bulkActionButtons={false}>
      <FunctionField label="Photo" sortable={false} render={(article: Article) => <BlogThumbnail coverImage={article.coverImage} coverAlt={article.coverAlt} compact />} />
      <TextField source="title" label="Title" /><TextField source="slug" label="URL" />
      <FunctionField label="Status" render={() => <Status />} />
      <DateField source="updatedAt" label="Updated" locales="en-US" showTime /><ShowButton label="Review" />
    </Datagrid>
  </List>;
}
function SaveToolbar() { return <Toolbar><SaveButton label="Save draft" /></Toolbar>; }
function Fields() {
  const {project}=useProject();
  return <>
    <Alert severity="info" sx={{ mb: 2 }}>Website content is in English. Review the draft after saving. Scheduled articles publish automatically at their assigned time.</Alert>
    <TextInput source="title" label="Title" validate={required()} fullWidth />
    <TextInput source="slug" label="Article URL (slug)" helperText="For example: a-helpful-guide" validate={required()} fullWidth />
    <TextInput source="description" label="Search description" multiline validate={required()} fullWidth />
    <TextInput source="publishedAt" label="Article date (ISO, including time zone)" helperText="For example: 2026-09-25T09:00:00Z. Use the Calendar to schedule automatic publication." validate={required()} fullWidth />
    <TextInput source="coverImage" label="Photo path" helperText="Generate a photo on the article review page after saving. One image is used for the cover and article." validate={required()} fullWidth />
    <TextInput source="coverAlt" label="Image description (alt text)" validate={required()} fullWidth />
    <TextInput source="body" label="Article body (Markdown)" multiline minRows={15} validate={required()} fullWidth helperText={`## Subheading · **emphasis** · [link](${project.links[0] || "/"}). HTML is not rendered.`} />
  </>;
}
function ArticleCreate() {
  const {project}=useProject();
  return <Create title="New article" redirect="show"><SimpleForm defaultValues={() => ({ publishedAt: new Date().toISOString(), coverImage: project.covers[0].id })} toolbar={<SaveToolbar />}><Fields /></SimpleForm></Create>;
}
function EditForm() {
  const article = useRecordContext<Article>();
  if (article?.commit || article?.status === "deploying") return <Alert severity="info" sx={{ m: 3 }}>This version has already been sent to the website and is locked. Use Git to edit published articles for now.</Alert>;
  return <SimpleForm toolbar={<SaveToolbar />}><Fields /></SimpleForm>;
}
function ArticleEdit() { return <Edit title="Edit draft" mutationMode="pessimistic" redirect="show" actions={<TopToolbar><ShowButton label="Preview" /></TopToolbar>}><EditForm /></Edit>; }
function Preview() {
  const {api,project,base}=useProject();
  const article = useRecordContext<Article>(); const notify = useNotify(); const refresh = useRefresh();
  const [busy, setBusy] = useState(false); const [confirm, setConfirm] = useState(false);
  useEffect(() => {
    if (!article || article.status !== "deploying") return;
    const timeout = setTimeout(() => {
      api(`/articles/${article.id}/verify`, "POST", { revision: article.revision }).then(refresh).catch(() => { /* Manual retry stays available. */ });
    }, 20000);
    return () => clearTimeout(timeout);
  }, [article, refresh, api]);
  if (!article) return null;
  const action = async (name: string) => {
    setBusy(true); setConfirm(false);
    try {
      const { data } = await api(`/articles/${article.id}/${name}`, "POST", { revision: article.revision });
      notify(data.status === "failed" ? data.error : name === "approve" ? "Version approved" : ["publish","publish-now"].includes(name) ? "Article sent. Waiting for the website deployment." : data.status === "published" ? "Publication verified" : data.error || "Check complete", { type: data.status === "failed" ? "warning" : "info" });
      refresh();
    } catch (e) { notify((e as Error).message, { type: "error" }); }
    finally { setBusy(false); refresh(); }
  };
  return <Box p={{ xs: 2, md: 4 }}>
    {project.localOnly&&<Alert severity="info" sx={{mb:2}}>Local test project. You can edit drafts; GitHub publication is disabled.</Alert>}
    {article.schedule && <Alert severity={article.schedule.enabled ? "info" : "warning"} sx={{ mb: 2 }}>{article.schedule.enabled ? `Automatic publication: ${new Date(article.schedule.publishAt).toLocaleString("en-US", {timeZone:"America/Los_Angeles",dateStyle:"medium",timeStyle:"short"})} PT. The latest saved version will be published, regardless of manual approval.` : "Automatic publication is paused in Calendar settings."} <a href={`#${base}/calendar`}>Calendar</a></Alert>}
    <Stack direction="row" spacing={2} alignItems="center" mb={2}><Status /><Typography color="text.secondary">Version {article.revision} · {project.brand}</Typography></Stack>
    <Stack direction="row" gap={1} flexWrap="wrap" mb={3}>
      {!article.commit && article.status !== "deploying" && <EditButton label="Edit" />}
      {!project.localOnly && !article.commit && ["draft","approved","failed"].includes(article.status) && <Button variant="contained" disabled={busy} onClick={() => setConfirm(true)}>Publish now</Button>}
      {article.commit && article.status === "failed" && article.approvedHash && <Button variant="contained" disabled={busy} onClick={() => setConfirm(true)}>{article.commit ? "Retry publishing" : "Publish to website"}</Button>}
      {article.commit && article.status !== "published" && <Button disabled={busy} onClick={() => action("verify")}>Verify publication</Button>}
      {article.status === "published" && <Button href={`${project.url}/blog/${article.slug}`} target="_blank" rel="noreferrer">Open article ↗</Button>}
    </Stack>
    {article.status === "deploying" && <Alert severity="info" sx={{ mb: 2 }}>Waiting for Netlify. This page checks every 20 seconds while it is open.</Alert>}
    {article.error && <Alert severity={article.status === "failed" ? "warning" : "info"} sx={{ mb: 2 }}>{article.error}</Alert>}
    {article.commit && <Typography variant="body2" color="text.secondary" mb={2}>Commit: <a href={`https://github.com/${project.repository}/commit/${article.commit}`} target="_blank" rel="noreferrer">{article.commit.slice(0, 7)}</a>{article.deployId && ` · Deployment: ${article.deployId}`}</Typography>}
    <ArticlePreparation key={article.id} article={article} />
    <AIRewrite article={article} />
    <Card variant="outlined"><CardContent sx={{ p: { xs: 2, md: 4 } }}><article className="article-preview">
      <Typography variant="overline">PREVIEW · {new Date(article.publishedAt).toLocaleDateString("en-US")}</Typography>
      <h1>{article.title}</h1><p>{article.description}</p>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className="article-cover" src={article.coverImage.startsWith("/images/blog-") ? `/api${base}/media/${article.coverImage.slice(13,-5)}` : `${project.url}${article.coverImage}`} alt={article.coverAlt} />
      <Markdown skipHtml components={{ a: ({ href, children }) => <a href={href?.startsWith("/") ? `${project.url}${href}` : href} target="_blank" rel="noreferrer">{children}</a> }}>{article.body}</Markdown>
    </article></CardContent></Card>
    <Dialog open={confirm} onClose={() => setConfirm(false)}><DialogTitle>Publish this article now?</DialogTitle><DialogContent>The latest saved version of “{article.title}” will pass editorial and photo checks, then be sent to {project.url}. This publishes it now instead of waiting for its scheduled date. It will appear after a successful website build.</DialogContent><DialogActions><Button onClick={() => setConfirm(false)}>Cancel</Button><Button variant="contained" onClick={() => action(article.commit ? "publish" : "publish-now")}>Publish now</Button></DialogActions></Dialog>
  </Box>;
}
function ArticleShow() { return <Show title="Review article" actions={false}><Preview /></Show>; }
export default function AdminApp() {return <ProjectCatalog><CatalogAdmin /></ProjectCatalog>;}
function CatalogAdmin() {
  const projects=useCatalog().projects.filter(p=>!p.archivedAt);
  return <Admin title="Inspirovate" dashboard={Projects} layout={ProjectLayout} catchAll={MissingPage} dataProvider={dataProvider} theme={theme} darkTheme={null} disableTelemetry>
    {projects.map(project=><Resource key={project.id} name={`projects/${project.id}/articles`} options={{label:`${project.name} articles`}}
      list={<ProjectFrame project={project}><ArticleList /></ProjectFrame>}
      create={<ProjectFrame project={project}><ArticleCreate /></ProjectFrame>}
      edit={<ProjectFrame project={project}><ArticleEdit /></ProjectFrame>}
      show={<ProjectFrame project={project}><ArticleShow /></ProjectFrame>} recordRepresentation="title" />)}
    <CustomRoutes><Route path="/projects" element={<Projects />} />
      {projects.map(project=>[
        <Route key={`${project.id}-overview`} path={projectPath(project.id)} element={<ProjectFrame key={project.id} project={project}><ProjectOverview /></ProjectFrame>} />,
        <Route key={`${project.id}-calendar`} path={projectPath(project.id,'calendar')} element={<ProjectFrame key={project.id} project={project}><Schedule /></ProjectFrame>} />,
        <Route key={`${project.id}-generate`} path={projectPath(project.id,'generate')} element={<ProjectFrame key={project.id} project={project}><AIGenerator /></ProjectFrame>} />,
        <Route key={`${project.id}-knowledge`} path={projectPath(project.id,'knowledge')} element={<ProjectFrame key={project.id} project={project}><Knowledge /></ProjectFrame>} />,
        <Route key={`${project.id}-library`} path={projectPath(project.id,'library')} element={<ProjectFrame key={project.id} project={project}><Library /></ProjectFrame>} />,
        <Route key={`${project.id}-settings`} path={projectPath(project.id,'settings')} element={<ProjectFrame key={project.id} project={project}><Integrations /></ProjectFrame>} />,
      ])}
    </CustomRoutes>
  </Admin>;
}
