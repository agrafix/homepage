# frozen_string_literal: true

# Ruby 4 removed tainting; Liquid 4.x still calls `tainted?`.
# Provide a no-op implementation so Jekyll can render on Ruby 4.
unless Object.method_defined?(:tainted?)
  class Object
    def tainted?
      false
    end
  end
end
