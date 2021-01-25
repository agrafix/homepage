FROM ruby:2.7.2
COPY Gemfile Gemfile.lock _config.yml /work/build/
WORKDIR /work/build
RUN bundle install
COPY . /work/build
RUN touch Gemfile.lock && chmod a+w Gemfile.lock
RUN bundle exec jekyll build
RUN tar -zcvf site.tar.gz _site
