CREATE TABLE users (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    email text UNIQUE NOT NULL
);

CREATE TABLE feeds (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid REFERENCES users(id),
    url text NOT NULL,
    title text,
    created_at timestamptz DEFAULT now()
);

CREATE TABLE articles (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    feed_id uuid REFERENCES feeds(id),
    user_id uuid REFERENCES users(id),
    title text NOT NULL,
    link text NOT NULL,
    published_at timestamptz,
    read boolean DEFAULT false,
    saved boolean DEFAULT false,
    UNIQUE(user_id, link) -- prevent duplicates per user
);

CREATE TABLE removed_articles (
    user_id uuid REFERENCES users(id),
    link text NOT NULL,
    PRIMARY KEY (user_id, link)
);

-- You need to drop and recreate the constraint, or alter the table:
ALTER TABLE articles DROP CONSTRAINT articles_feed_id_fkey;
ALTER TABLE articles ADD CONSTRAINT articles_feed_id_fkey FOREIGN KEY (feed_id) REFERENCES feeds(id) ON DELETE CASCADE;
GRANT SELECT, INSERT, DELETE ON removed_articles TO steven;