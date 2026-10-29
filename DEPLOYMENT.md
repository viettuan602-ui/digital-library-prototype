# Deploy Digital Library prototype

This project uses Netlify for the static frontend, Render for the FastAPI service, and Supabase for PostgreSQL and PDF storage. Your computer does not need to stay on after deployment.

## 1. Prepare a GitHub repository

Create a GitHub repository for this project and push the code. Keep `.env`, database files, and the `storage/` folder out of the repository; `.gitignore` is configured for them. Do not publish real credentials or PDFs you are not allowed to redistribute.

## 2. Create Supabase resources

1. Create a Supabase project.
2. Create a **private** Storage bucket named `digital-library-books`.
3. Copy the PostgreSQL connection string and project URL from the Supabase dashboard. Use the session pooler connection string if the direct database hostname is not reachable from Render.
4. Keep the database password and service-role key private. They belong only in Render environment variables.

The current upload limit is 50 MB per PDF. Supabase recommends resumable uploads for files over 6 MB; the current backend upload path is intended for small prototype files.

## 3. Deploy the API on Render

1. In Render, create a Blueprint from the GitHub repository and select `render.yaml`.
2. Set the prompted values:
   - `DATABASE_URL`: Supabase PostgreSQL connection string.
   - `PUBLIC_API_BASE_URL`: the HTTPS URL Render assigns to the API service.
   - `CORS_ORIGINS`: the Netlify site origin, for example `https://your-site.netlify.app`.
   - `INITIAL_ADMIN_EMAIL` and `INITIAL_ADMIN_PASSWORD`: a new admin account for the hosted prototype.
   - `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`: from the Supabase project settings.
3. Render generates `SECRET_KEY` through the Blueprint. Never replace it with the demo key.
4. Wait for `/healthz` to report `{"status":"ok","app":"Digital Library Demo"}`.

Render Free web services may sleep after inactivity. The first request after sleep can take about a minute. The database and uploaded PDFs use Supabase rather than Render's temporary filesystem.

## 4. Deploy the frontend on Netlify

1. Import the same GitHub repository as a Netlify site.
2. Set the site environment variable `PUBLIC_API_BASE_URL` to the Render API URL, including `https://` and without a trailing slash.
3. Keep the repository root as the base directory. `netlify.toml` sets the build command and publishes `Frontend`.
4. Deploy, then add the resulting `https://<site-name>.netlify.app` origin to Render's `CORS_ORIGINS` if it was not known earlier. Redeploy the API after changing its environment values.

Netlify deploys the frontend when changes are pushed to the connected branch. Its Free plan has a monthly credit limit; Netlify pauses projects if that limit is reached.

## 5. Download source button

When ready to share source code, publish a GitHub Release from the cleaned repository and point the site's download button to the Releases page. The public source should include setup instructions and `.env.example`, but not database exports, environment secrets, local PDFs, or account credentials.
