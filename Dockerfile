FROM jekyll/jekyll:4
ADD . /work/build
WORKDIR /work/build
RUN bundle exec jekyll build