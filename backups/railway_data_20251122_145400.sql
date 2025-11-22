--
-- PostgreSQL database dump
--

\restrict wNuGf52qp5deiKC8DpvwDBhvsbgSsLJUS9SmncD03dt3ifZQ1pznY6mMxUGa75I

-- Dumped from database version 17.7 (Debian 17.7-3.pgdg13+1)
-- Dumped by pg_dump version 18.0

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Data for Name: Account; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public."Account" (id, "userId", type, provider, "providerAccountId", refresh_token, access_token, expires_at, token_type, scope, id_token, session_state) FROM stdin;
\.


--
-- Data for Name: Company; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public."Company" (id, name, "createdAt", "updatedAt") FROM stdin;
00595f90-8957-4367-9861-05e5758e98d6	Porsche	2025-11-20 04:18:11.888	2025-11-20 04:18:11.888
demo-company-id	Demo Auto Company	2025-11-20 04:19:18.73	2025-11-20 04:19:18.73
49df1dd7-c923-4e81-8f02-970cd28db2e4	Porshe	2025-11-20 04:19:54.247	2025-11-20 04:19:54.247
\.


--
-- Data for Name: CarModel; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public."CarModel" (id, name, "createdAt", "updatedAt", "companyId") FROM stdin;
deb3c001-5796-441a-a586-c500c6144f98	Porsche	2025-11-20 04:18:41.046	2025-11-20 04:18:41.046	00595f90-8957-4367-9861-05e5758e98d6
15a7667b-b38d-44df-a853-0e13fede0b73	Mustang	2025-11-20 04:20:11.435	2025-11-20 04:20:11.435	demo-company-id
e5bc4ef1-4be3-4cfb-9be5-12251ec68f65	Porsche 911	2025-11-20 20:54:14.169	2025-11-20 20:54:52.56	00595f90-8957-4367-9861-05e5758e98d6
\.


--
-- Data for Name: CarVariant; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public."CarVariant" (id, year, "trim", "createdAt", "modelId") FROM stdin;
eab73234-2a67-4b7e-927f-b154b98e3676	2024	GT3	2025-11-20 04:18:41.516	deb3c001-5796-441a-a586-c500c6144f98
9d2e1c84-716b-4e52-927d-edec14516762	2024	GT	2025-11-20 04:20:11.435	15a7667b-b38d-44df-a853-0e13fede0b73
d125357b-d8db-4333-a470-df21c7aea5fe	2024	EcoBoost	2025-11-20 04:20:11.435	15a7667b-b38d-44df-a853-0e13fede0b73
a5f2ca1d-f225-4599-8b50-0870613174b6	2023	Mach-E	2025-11-20 04:20:11.435	15a7667b-b38d-44df-a853-0e13fede0b73
3b48ba1d-3343-4c67-9c55-138d166fee63	2024	Carrera	2025-11-20 20:54:14.661	e5bc4ef1-4be3-4cfb-9be5-12251ec68f65
\.


--
-- Data for Name: CarMedia; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public."CarMedia" (id, type, "s3Key", filename, "mimeType", size, "createdAt", "variantId") FROM stdin;
6fe14b00-b3b7-4618-a661-9e700159525c	EXTERIOR	cars/00595f90-8957-4367-9861-05e5758e98d6/deb3c001-5796-441a-a586-c500c6144f98/eab73234-2a67-4b7e-927f-b154b98e3676/exterior/1763615414386-aerial.png	aerial.png	image/png	814706	2025-11-20 05:10:15.013	eab73234-2a67-4b7e-927f-b154b98e3676
46e9182d-1d2a-40eb-b531-276de41ca51b	EXTERIOR	cars/00595f90-8957-4367-9861-05e5758e98d6/deb3c001-5796-441a-a586-c500c6144f98/eab73234-2a67-4b7e-927f-b154b98e3676/exterior/1763615415578-back.png	back.png	image/png	575131	2025-11-20 05:10:16.206	eab73234-2a67-4b7e-927f-b154b98e3676
330b6421-ee14-4b0a-9e5c-5a8cdbaa4e6a	EXTERIOR	cars/00595f90-8957-4367-9861-05e5758e98d6/deb3c001-5796-441a-a586-c500c6144f98/eab73234-2a67-4b7e-927f-b154b98e3676/exterior/1763615416666-back45.png	back45.png	image/png	726392	2025-11-20 05:10:17.287	eab73234-2a67-4b7e-927f-b154b98e3676
e91578a2-13bf-44e0-97ee-884db34a0f63	EXTERIOR	cars/00595f90-8957-4367-9861-05e5758e98d6/deb3c001-5796-441a-a586-c500c6144f98/eab73234-2a67-4b7e-927f-b154b98e3676/exterior/1763615417737-front.png	front.png	image/png	525434	2025-11-20 05:10:18.316	eab73234-2a67-4b7e-927f-b154b98e3676
11a66021-f95d-4013-bb14-a7d1f682c354	EXTERIOR	cars/00595f90-8957-4367-9861-05e5758e98d6/deb3c001-5796-441a-a586-c500c6144f98/eab73234-2a67-4b7e-927f-b154b98e3676/exterior/1763615418762-front45.png	front45.png	image/png	680892	2025-11-20 05:10:19.379	eab73234-2a67-4b7e-927f-b154b98e3676
4d253383-35e0-4852-885e-f0b97c5dc513	INTERIOR	cars/00595f90-8957-4367-9861-05e5758e98d6/deb3c001-5796-441a-a586-c500c6144f98/eab73234-2a67-4b7e-927f-b154b98e3676/interior/1763615419833-interior.jpeg	interior.jpeg	image/jpeg	287621	2025-11-20 05:10:20.45	eab73234-2a67-4b7e-927f-b154b98e3676
ea21b922-1054-493e-80b3-7152475cf3b7	EXTERIOR	cars/00595f90-8957-4367-9861-05e5758e98d6/e5bc4ef1-4be3-4cfb-9be5-12251ec68f65/3b48ba1d-3343-4c67-9c55-138d166fee63/exterior/1763672055142-aerial.png	aerial.png	image/png	814706	2025-11-20 20:54:16.517	3b48ba1d-3343-4c67-9c55-138d166fee63
ebf40d48-64e1-49fe-9df4-c78c71e148fb	EXTERIOR	cars/00595f90-8957-4367-9861-05e5758e98d6/e5bc4ef1-4be3-4cfb-9be5-12251ec68f65/3b48ba1d-3343-4c67-9c55-138d166fee63/exterior/1763672057154-back.png	back.png	image/png	575131	2025-11-20 20:54:17.726	3b48ba1d-3343-4c67-9c55-138d166fee63
ed7fb668-0fc7-4dbb-a117-2d753a1a8d99	EXTERIOR	cars/00595f90-8957-4367-9861-05e5758e98d6/e5bc4ef1-4be3-4cfb-9be5-12251ec68f65/3b48ba1d-3343-4c67-9c55-138d166fee63/exterior/1763672058233-back45.png	back45.png	image/png	726392	2025-11-20 20:54:18.814	3b48ba1d-3343-4c67-9c55-138d166fee63
5db02d96-7dc3-4fd2-a755-0c67cf4c05a9	EXTERIOR	cars/00595f90-8957-4367-9861-05e5758e98d6/e5bc4ef1-4be3-4cfb-9be5-12251ec68f65/3b48ba1d-3343-4c67-9c55-138d166fee63/exterior/1763672059331-front.png	front.png	image/png	525434	2025-11-20 20:54:19.946	3b48ba1d-3343-4c67-9c55-138d166fee63
3b197c62-59e2-44af-a758-6319ae8c88ad	EXTERIOR	cars/00595f90-8957-4367-9861-05e5758e98d6/e5bc4ef1-4be3-4cfb-9be5-12251ec68f65/3b48ba1d-3343-4c67-9c55-138d166fee63/exterior/1763672060453-front45.png	front45.png	image/png	680892	2025-11-20 20:54:21.112	3b48ba1d-3343-4c67-9c55-138d166fee63
f25f0a93-6768-4eaf-b9f4-4dc5a4f292a3	INTERIOR	cars/00595f90-8957-4367-9861-05e5758e98d6/e5bc4ef1-4be3-4cfb-9be5-12251ec68f65/3b48ba1d-3343-4c67-9c55-138d166fee63/interior/1763672061638-interior.jpeg	interior.jpeg	image/jpeg	287621	2025-11-20 20:54:22.198	3b48ba1d-3343-4c67-9c55-138d166fee63
\.


--
-- Data for Name: CompanyAsset; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public."CompanyAsset" (id, type, value, "s3Key", filename, "mimeType", size, "createdAt", "companyId") FROM stdin;
7aa3fbd0-7e43-4ede-abcd-a41272a902ea	COLOR_SCHEME	{"text": "#ffffff", "accent": "#3b82f6", "primary": "#2563eb", "secondary": "#1e40af", "background": "#1f2937"}	\N	\N	\N	\N	2025-11-20 04:20:11.209	demo-company-id
126dee99-15e8-4259-960e-f56efb1989cb	LOGO	\N	companies/00595f90-8957-4367-9861-05e5758e98d6/logos/2986fd96-e2ed-4766-b5fb-93b88e01dbb2.png	porsche-logo-png_seeklogo-168544.png	image/png	18870	2025-11-21 18:16:31.243	00595f90-8957-4367-9861-05e5758e98d6
\.


--
-- Data for Name: FileStorage; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public."FileStorage" (id, "s3Key", "localPath", category, "mimeType", size, "contentHash", "isUploaded", "isDeleted", "createdAt", "uploadedAt", "deletedAt", "projectId", "sceneId") FROM stdin;
\.


--
-- Data for Name: User; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public."User" (id, email, name, password, role, "createdAt", "updatedAt", "companyId") FROM stdin;
8299f4ae-75fc-4d7e-a862-10b3b38bd3a8	admin@demo.com	Admin User	$2b$12$.cS8Eata7KQz4TD63NcWLOEX4ANrf5naZ0hLxvpc2S5nSH3WXcEN.	ADMIN	2025-11-20 04:20:09.525	2025-11-20 04:20:09.525	demo-company-id
8e634c58-e05b-4203-ba38-c14758e40712	member@demo.com	Member User	$2b$12$.cS8Eata7KQz4TD63NcWLOEX4ANrf5naZ0hLxvpc2S5nSH3WXcEN.	MEMBER	2025-11-20 04:20:10.416	2025-11-20 04:20:10.416	demo-company-id
afdea7b3-1c08-4e2f-95b5-6a1b0e5de3db	admin@test.com	Test Admin	$2b$12$.cS8Eata7KQz4TD63NcWLOEX4ANrf5naZ0hLxvpc2S5nSH3WXcEN.	ADMIN	2025-11-20 04:19:20.091	2025-11-20 04:20:10.984	demo-company-id
af9d134c-1da5-47b3-82ce-f4ae94fa5eb9	amanyrath@gmail.com	Alexis Manyrath	$2b$12$KTtta7.udsP9JLnW.Q1WRu6PHjG42rVvCdhqOc9.l0oaIbqLYktNW	MEMBER	2025-11-20 04:32:22.508	2025-11-20 04:32:22.508	00595f90-8957-4367-9861-05e5758e98d6
41b10b40-2199-4ff2-94e0-6079d5c4630e	test@porsche.com	Porsche Test User	$2b$12$E9V9w5NfQ35e5y2KeKoTpeTA7g2DHuXFeZyYX5hEpEWeOKMVktVvm	MEMBER	2025-11-20 05:55:22	2025-11-20 05:55:22	00595f90-8957-4367-9861-05e5758e98d6
\.


--
-- Data for Name: Project; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public."Project" (id, name, prompt, "targetDuration", status, "finalVideoUrl", "finalVideoS3Key", "characterDescription", "createdAt", "updatedAt", "companyId", "ownerId") FROM stdin;
84d37929-1bc6-4b41-a8ee-4544dee61e68	Summer Campaign 2024	A cinematic advertisement showcasing the 2024 Mustang GT driving through scenic mountain roads at sunset, highlighting its performance and elegance.	30	STORYBOARD	\N	\N	\N	2025-11-20 04:20:12.562	2025-11-20 04:20:12.562	demo-company-id	8299f4ae-75fc-4d7e-a862-10b3b38bd3a8
\.


--
-- Data for Name: Scene; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public."Scene" (id, "sceneNumber", "sceneTitle", "sceneSummary", "imagePrompt", "suggestedDuration", "negativePrompt", "customDuration", "customImageInput", "useSeedFrame", status, "createdAt", "updatedAt", "projectId", "videoPrompt", "modelParameters") FROM stdin;
06ddc14d-36ea-4e61-83a9-2a42d6efecd9	1	Opening Shot	Wide aerial shot of mountain landscape at golden hour, camera slowly reveals the winding road below.	Cinematic aerial shot of mountain landscape at golden hour, winding mountain road visible below, dramatic clouds, 4K quality	4	\N	\N	\N	f	PENDING	2025-11-20 04:20:12.562	2025-11-20 04:20:12.562	84d37929-1bc6-4b41-a8ee-4544dee61e68	Cinematic aerial shot of mountain landscape at golden hour, winding mountain road visible below, dramatic clouds, 4K quality	\N
45b08fcb-55a0-4d1e-94ea-dde18fdba01f	2	Car Introduction	First glimpse of the Mustang GT appearing around a curve, engine sound building.	2024 Ford Mustang GT in deep blue, emerging from mountain curve, motion blur background, cinematic lighting, professional car photography	5	\N	\N	\N	f	PENDING	2025-11-20 04:20:12.562	2025-11-20 04:20:12.562	84d37929-1bc6-4b41-a8ee-4544dee61e68	2024 Ford Mustang GT in deep blue, emerging from mountain curve, motion blur background, cinematic lighting, professional car photography	\N
4291f79d-b58c-44ac-baa7-b9983cde0920	3	Performance Details	Close-up shots of performance features: wheels spinning, exhaust, hood lines.	Close-up of Mustang GT performance wheel spinning, brake caliper visible, dynamic action shot, shallow depth of field	6	\N	\N	\N	f	PENDING	2025-11-20 04:20:12.562	2025-11-20 04:20:12.562	84d37929-1bc6-4b41-a8ee-4544dee61e68	Close-up of Mustang GT performance wheel spinning, brake caliper visible, dynamic action shot, shallow depth of field	\N
9edb4e98-447f-479a-95c0-cdd80df4dc8b	4	Driving Experience	Interior shot of driver enjoying the ride, hands on steering wheel, dashboard visible.	Interior shot of driver in Mustang GT, hands on steering wheel, digital dashboard glowing, leather seats, sunset light streaming through window	5	\N	\N	\N	f	PENDING	2025-11-20 04:20:12.562	2025-11-20 04:20:12.562	84d37929-1bc6-4b41-a8ee-4544dee61e68	Interior shot of driver in Mustang GT, hands on steering wheel, digital dashboard glowing, leather seats, sunset light streaming through window	\N
649a2598-0341-4b4c-bf3d-1f612e967f2b	5	Final Shot	Hero shot of the car parked at scenic overlook with sunset, logo fade in.	Ford Mustang GT parked at scenic mountain overlook, sunset background, hero shot, professional automotive photography, dramatic composition	10	\N	\N	\N	f	PENDING	2025-11-20 04:20:12.562	2025-11-20 04:20:12.562	84d37929-1bc6-4b41-a8ee-4544dee61e68	Ford Mustang GT parked at scenic mountain overlook, sunset background, hero shot, professional automotive photography, dramatic composition	\N
\.


--
-- Data for Name: GeneratedImage; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public."GeneratedImage" (id, url, "s3Key", "localPath", prompt, "replicateId", "isSelected", "createdAt", "sceneId") FROM stdin;
\.


--
-- Data for Name: GeneratedVideo; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public."GeneratedVideo" (id, url, "s3Key", "localPath", duration, prompt, "isSelected", "createdAt", "sceneId") FROM stdin;
\.


--
-- Data for Name: ProcessedImageVersion; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public."ProcessedImageVersion" (id, "s3Key", "localPath", "processingType", iteration, "mimeType", size, "isUploaded", "createdAt", "uploadedAt", "originalFileId", "projectId", "sceneId") FROM stdin;
\.


--
-- Data for Name: SeedFrame; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public."SeedFrame" (id, url, "s3Key", "frameIndex", "isSelected", "createdAt", "sceneId") FROM stdin;
\.


--
-- Data for Name: Session; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public."Session" (id, "sessionToken", "userId", expires) FROM stdin;
\.


--
-- Data for Name: TimelineClip; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public."TimelineClip" (id, title, "startTime", duration, "trimStart", "trimEnd", "order", "createdAt", "updatedAt", "projectId", "sceneId", "videoId") FROM stdin;
\.


--
-- Data for Name: UploadedImage; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public."UploadedImage" (id, url, "s3Key", "originalName", "mimeType", size, "createdAt", "projectId") FROM stdin;
\.


--
-- Data for Name: VerificationToken; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public."VerificationToken" (identifier, token, expires) FROM stdin;
\.


--
-- Data for Name: _prisma_migrations; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public._prisma_migrations (id, checksum, finished_at, migration_name, logs, rolled_back_at, started_at, applied_steps_count) FROM stdin;
26226dae-0181-4226-b557-21762e724920	3cb063354cfc268da6ab9fa5f8a38f373bb7509f0d9f3ff6eed8e1b55c82716e	2025-11-20 03:00:05.94005+00	20251119151720_add_file_storage_models	\N	\N	2025-11-20 03:00:05.90665+00	1
95927cc7-c845-443e-ab13-b813af5ec786	4a70f611bbe1f73838ace68ef0978d054e18d25b0866c035313ad5ac291e8a75	2025-11-20 03:00:05.980946+00	20251119231127_init	\N	\N	2025-11-20 03:00:05.941997+00	1
ab2a37d6-d488-4986-9dc0-f617892161ac	db98bcf434440ee74f3de77a6dd7d7cf5c50b5b2703b7412f9237f6168a6bcc6	2025-11-21 23:29:09.385165+00	20251121164447_add_video_prompt	\N	\N	2025-11-21 23:29:08.765003+00	1
644b98ef-c57f-4e2b-893b-11ebd5132ef9	367c8bca96c201a6749a31651734bf9bf002a9053c32824f53cffc2f77e4666a	2025-11-21 23:29:16.64248+00	20251121232915_add_model_parameters_to_scene	\N	\N	2025-11-21 23:29:16.039477+00	1
\.


--
-- PostgreSQL database dump complete
--

\unrestrict wNuGf52qp5deiKC8DpvwDBhvsbgSsLJUS9SmncD03dt3ifZQ1pznY6mMxUGa75I

