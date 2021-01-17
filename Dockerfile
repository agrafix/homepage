FROM ruby:2.7.2
ADD . /work/build
WORKDIR /work/build
RUN bundle install
RUN touch Gemfile.lock && chmod a+w Gemfile.lock
RUN bundle exec jekyll build
RUN tar -zcvf site.tar.gz _site